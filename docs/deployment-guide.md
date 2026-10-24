# Production Deployment & AWS Architecture Guide

This document outlines the cost-conscious production deployment strategy, cloud architecture decisions, database backup/restore procedures, and operational runbooks for the EventFlow Event Registration and Ticketing Platform.

---

## 1. Cost-Conscious AWS Architecture Plan

### Target Infrastructure: Single-Host Containerized Topology
For a student portfolio project or early-stage platform, maximizing cost-efficiency while maintaining high availability and security is paramount.

```
                              [Internet]
                                  │
                                  ▼
                         [AWS Route 53 / DNS]
                                  │ (HTTPS :443 / HTTP :80)
                                  ▼
                   ┌───────────────────────────────┐
                   │    AWS EC2 (t4g.small)        │
                   │    Ubuntu 24.04 LTS (ARM64)   │
                   │                               │
                   │  ┌─────────────────────────┐  │
                   │  │ Nginx (Reverse Proxy)   │  │
                   │  │ - TLS (Let's Encrypt)   │  │
                   │  │ - Static SPA (/dist)    │  │
                   │  │ - Gzip & Security Hdr   │  │
                   │  └───────────┬─────────────┘  │
                   │              │                │
                   │  ┌───────────▼─────────────┐  │
                   │  │ FastAPI App (4 Workers) │  │
                   │  │ - WebSockets & REST     │  │
                   │  │ - Connection Pooling    │  │
                   │  └─────┬──────────────┬────┘  │
                   │        │              │       │
                   │  ┌─────▼─────┐  ┌─────▼─────┐ │
                   │  │PostgreSQL │  │  Redis 7  │ │
                   │  │16 (Docker)│  │ (Docker)  │ │
                   │  └─────┬─────┘  └───────────┘ │
                   │        │                      │
                   │  ┌─────▼───────────────────┐  │
                   │  │ EBS Volume (gp3, 30 GB) │  │
                   │  └─────────────────────────┘  │
                   └───────────────────────────────┘
                                  │ (Daily cron encrypted backup)
                                  ▼
                        [AWS S3 Backup Bucket]
```

---

### Cost Breakdown & Tradeoff Analysis

| Component | Architecture Option A: High-Frugality (Implemented) | Architecture Option B: Fully Managed AWS PaaS | Monthly Savings |
|---|---|---|---|
| **Compute** | EC2 `t4g.small` (2 vCPU, 2GB RAM): **~$12.26 / month** (or `t4g.micro` Free Tier for 750 hrs/mo) | ECS Fargate (2 tasks, 0.5 vCPU, 1GB): ~$18.00 / mo | ~$6.00 / mo |
| **Database** | PostgreSQL 16 in Docker on EBS `gp3`: **~$2.40 / month** (30GB gp3) | AWS RDS PostgreSQL `db.t4g.micro` (Multi-AZ): ~$34.00 / mo | ~$31.60 / mo |
| **Network / NAT** | Single Public Subnet with strict Security Group: **$0.00** | NAT Gateway for Private Subnets: **~$32.40 / month** | ~$32.40 / mo |
| **Caching / PubSub** | Redis 7 in Docker on EC2: **$0.00 (included)** | AWS ElastiCache Redis `cache.t4g.micro`: ~$12.50 / mo | ~$12.50 / mo |
| **Artifact Storage** | PostgreSQL text & S3 Glacier backups (<1GB): **~$0.05 / month** | Managed S3 Standard with lifecycle policies: ~$0.50 / mo | ~$0.45 / mo |
| **TOTAL** | **~$14.71 / month** (or **$0 - $2.40/mo** under Free Tier) | **~$97.40 / month** | **~$82.69 / mo (85% Savings)** |

#### Key Rationale:
1. **Why not AWS RDS?**
   Managed RDS PostgreSQL requires either public exposure (security risk) or a VPC NAT Gateway ($32.40/mo base charge before data transfer). For a student portfolio project, hosting PostgreSQL 16 on an encrypted EBS volume (`gp3`) with daily S3 dumps saves >$60/month while preserving full PostgreSQL 16 feature parity (including `SELECT ... FOR UPDATE` row-level locks and transactional DDL).
2. **Why not S3 for certificates?**
   Jinja2 HTML certificates with cryptographic SHA-256 verification hashes are rendered and stored in PostgreSQL text columns with zero external cloud dependencies. S3 is only justified if distributing multi-megabyte PDFs to millions of users.

---

## 2. Security & Network Hardening

### AWS Security Group Configuration
| Protocol | Port | Source | Description |
|---|---|---|---|
| TCP | `80` | `0.0.0.0/0` | HTTP traffic (redirected to 443 by Nginx) |
| TCP | `443` | `0.0.0.0/0` | HTTPS encrypted client traffic |
| TCP | `22` | `<Operator-IP>/32` | SSH administration access (strictly IP-restricted) |
| TCP | `5432` | None | PostgreSQL port is **never** bound to host or exposed to AWS |
| TCP | `6379` | None | Redis port is **never** bound to host or exposed to AWS |

### Application Hardening
1. **Environment Separation**: `DEBUG=false` and `ENVIRONMENT=production` in production.
2. **CORS Restrictions**: Explicitly configured allowed origins in `CORS_ORIGINS`.
3. **Database Connection Pooling**:
   - `DB_POOL_SIZE=20`
   - `DB_MAX_OVERFLOW=10`
   - `DB_POOL_TIMEOUT=30`
   - `DB_POOL_RECYCLE=1800` (recycles connections to avoid stale TCP drops)
   - `pool_pre_ping=True` (proactively tests connection before query execution)
4. **Credential Redaction**:
   - JSON structured logging intercepts all HTTP requests and strips passwords, JWT tokens, and authorization headers (`[REDACTED]`).
5. **Observability Protection**:
   - The `/metrics` and `/api/v1/metrics` endpoints require an authorized Bearer token or organizer JWT.

---

## 3. Database Migration, Backup & Restore Runbook

### Clean Database Initialization
To initialize a fresh database from scratch on a new instance:
```bash
# 1. Start database container
docker compose -f docker-compose.prod.yml up -d db redis

# 2. Apply all migrations in order
docker compose -f docker-compose.prod.yml exec backend alembic upgrade head

# 3. Verify schema synchronization
docker compose -f docker-compose.prod.yml exec backend alembic check
```

### Automated Backup Procedure (Daily Cron)
Create `/usr/local/bin/eventflow-backup.sh`:
```bash
#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="/var/backups/eventflow"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
FILENAME="${BACKUP_DIR}/eventflow_backup_${TIMESTAMP}.sql.gz"

mkdir -p "${BACKUP_DIR}"

# Execute pg_dump within container and compress with gzip
docker compose -f /opt/eventflow/docker-compose.prod.yml exec -T db \
  pg_dump -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" --no-owner --clean | gzip > "${FILENAME}"

# Optional: Upload to S3 if configured
# aws s3 cp "${FILENAME}" s3://eventflow-backups/database/

# Retain only last 14 days locally
find "${BACKUP_DIR}" -type f -name "*.sql.gz" -mtime +14 -delete
```

### Database Restore Procedure
In the event of database recovery:
```bash
# 1. Stop web application services
docker compose -f docker-compose.prod.yml stop backend nginx

# 2. Decompress and stream SQL into the database
gunzip -c /var/backups/eventflow/eventflow_backup_<TIMESTAMP>.sql.gz | \
  docker compose -f docker-compose.prod.yml exec -T db \
  psql -U "${POSTGRES_USER}" -d "${POSTGRES_DB}"

# 3. Restart web application
docker compose -f docker-compose.prod.yml start backend nginx
```

---

## 4. Step-by-Step EC2 Deployment Guide

1. **Launch EC2 Instance**:
   - AMI: Ubuntu 24.04 LTS (ARM64 for Graviton `t4g.small` or x86_64 for `t3.small`).
   - Storage: 30 GB gp3 root volume.
   - Attach Elastic IP (EIP) to ensure persistent public IP across reboots.

2. **Install Docker & Docker Compose**:
   ```bash
   sudo apt-get update && sudo apt-get install -y ca-certificates curl gnupg
   sudo install -m 0755 -d /etc/apt/keyrings
   curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
   echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
   sudo apt-get update && sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
   ```

3. **Deploy Code & Configuration**:
   ```bash
   git clone https://github.com/<username>/event-registration-platform.git /opt/eventflow
   cd /opt/eventflow
   cp .env.production.example .env.production
   nano .env.production  # Populate cryptographically random secrets
   chmod 600 .env.production
   ```

4. **Launch Application**:
   ```bash
   docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
   ```

5. **Configure Let's Encrypt TLS (Certbot)**:
   ```bash
   sudo apt-get install -y certbot
   sudo certbot certonly --webroot -w /var/www/certbot -d yourdomain.com
   ```
