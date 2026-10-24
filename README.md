# EventFlow — High-Throughput Event Registration & Ticketing Platform

[![CI Pipeline](https://github.com/aaryancr/event-registration-platform/actions/workflows/ci.yml/badge.svg)](https://github.com/aaryancr/event-registration-platform/actions/workflows/ci.yml)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.110+-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-336791?logo=postgresql&logoColor=white)](https://www.postgresql.org)
[![Redis](https://img.shields.io/badge/Redis-7-DC382D?logo=redis&logoColor=white)](https://redis.io)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=black)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)](https://www.docker.com)
[![Pytest](https://img.shields.io/badge/Tests-81%20Passed-4CAF50?logo=pytest&logoColor=white)](https://docs.pytest.org)

EventFlow is a production-grade, concurrency-safe event registration and ticketing platform engineered to prevent overselling, race conditions, and duplicate payments under high-throughput traffic. It pairs an authoritative PostgreSQL data store with transactional row-level locking, asynchronous document generation, real-time WebSocket availability streams, and comprehensive telemetry.

---

## 1. System Architecture & Component Diagram

```mermaid
graph TB
    subgraph Client Layer
        Browser["React 18 + Vite SPA<br/>(Attendee Portal / Organizer Console)"]
        Scraper["Prometheus Scraper / External Systems"]
    end

    subgraph Reverse Proxy & Gateway
        Nginx["Nginx Reverse Proxy<br/>(TLS Termination, Static SPA, Gzip)"]
    end

    subgraph Application Tier
        FastAPI["FastAPI Backend (4 Uvicorn Workers)<br/>- Structured JSON Logging (Redacted)<br/>- Liveness & Readiness Probes<br/>- Prometheus Exposition (:8000/metrics)"]
        WS["WebSocket Room Manager<br/>(Committed State Seat Broadcasting)"]
        Workers["Async Background Workers<br/>(Jinja2 Certificate Rendering)"]
    end

    subgraph State & Persistence Tier
        PG[("PostgreSQL 16 (Authoritative)<br/>- Explicit Row Locking (FOR UPDATE)<br/>- Idempotency Keys & Audit Logs<br/>- Registrations & FIFO Waitlists<br/>- Cryptographic Ticket Records")]
        Redis[("Redis 7 Cache<br/>- In-Memory State & Heartbeats<br/>- Inter-Worker Pub/Sub Bus")]
    end

    Browser -->|HTTPS :443 / REST| Nginx
    Browser -->|WSS :443 / WebSockets| Nginx
    Scraper -->|Bearer Token Auth| Nginx

    Nginx -->|Proxy HTTP /api/| FastAPI
    Nginx -->|Upgrade WS /ws/| WS
    Nginx -->|Serve /dist| Browser

    FastAPI -->|Connection Pool (size 20)| PG
    FastAPI -->|Ping / Caching| Redis
    FastAPI -->|Post-Commit Broadcast| WS
    FastAPI -->|Schedule Async Job| Workers
    Workers -->|Store Rendered Cert| PG
```

---

## 2. Implemented Features & Core Capabilities

### Concurrency Safety & Seat Allocation (Stages 5–6)
- **PostgreSQL as Single Source of Truth**: Evaluates occupied seats directly inside database transactions holding `SELECT ... FOR UPDATE` row-level exclusive locks on the target event.
- **Zero Overselling Guarantee**: Evaluates `occupied = active_registrations + active_unexpired_holds`. Concurrent transactions attempting to book beyond capacity receive HTTP `409 Conflict` without deadlocks or double-allocation.

### Idempotency Protection (Stage 7)
- Scoped deduplication `(user_id, endpoint, idempotency_key)` backed by PostgreSQL unique indexes.
- Prevents duplicate credit card charges and double registrations during network timeouts or client double-clicks.
- Replaying a key with matching payload returns the cached response code and body without re-executing business logic.
- Concurrent identical in-flight requests are guarded against with HTTP `409 Conflict`.

### Temporary Seat Holds & Mock Payment Flow (Stage 8)
- **10-Minute Reservation Holds**: Attendees acquire temporary holds that temporarily decrement available capacity.
- **Dynamic Capacity Accounting**: Unexpired holds (`expires_at > now()`) count toward occupied capacity. Expired holds automatically release capacity without blocking new attendees.
- **Mock Payment Lifecycle**: Transition holds to `paid` upon mock transaction confirmation. Simulating payment failures immediately transitions hold to `released`, restoring seat capacity.

### Transactional Waitlist & Cancellations (Stage 9)
- Deterministic FIFO waitlist queueing `(created_at ASC, id ASC)`.
- When a registered attendee cancels their seat, the backend atomically locks the event, marks the registration cancelled, and immediately promotes the earliest waiting candidate, generating their ticket in the same transaction.

### Cryptographic QR Tickets & Operator Check-In (Stage 10)
- Tickets feature cryptographically random 32-character hexadecimal codes (`secrets.token_hex(16)`).
- Generates pure SVG base64 QR codes (`data:image/svg+xml;base64,...`) without heavy external C-libraries (Pillow/libpng).
- **Single-Use Check-in**: Organizers validate tickets at venue entrance; attempts to reuse tickets are rejected with HTTP 409 and previous check-in timestamps.

### Asynchronous Certificate Delivery (Stage 11)
- Issues printable HTML certificates with cryptographic SHA-256 verification fingerprints.
- Renders certificates in background tasks with comprehensive error handling and failure tracking.
- Public verification endpoint `/api/v1/certificates/verify/{code}` allows anyone to verify authenticity.

### Real-Time WebSockets (Stage 12)
- Streams committed seat count changes over `/api/v1/events/{id}/ws`.
- Updates broadcast **only after** PostgreSQL transaction commit (`db.commit()`), ensuring clients never receive phantom dirty-read updates.
- Exponential backoff client reconnection with fallback REST API refreshes.

### Modern Responsive React SPA (Stage 13)
- Built with React 18, Vite, and TypeScript with a dark glassmorphic design system.
- Tabbed interface: Browse Events with live search, Attendee Portal (My Tickets with SVG QR viewer, My Certificates with printable layout), Organizer Console (Create/Publish Events, Live Check-in scanner), and System Ops Explorer.
- Secure token strategy: JWT stored in `sessionStorage` (scoped to browser tab lifecycle), completely avoiding token exposure in URLs.

### Observability & Telemetry (Stage 14–15)
- **Structured JSON Logging**: Request logging with correlation `X-Request-ID`, latency in milliseconds, and automatic sanitization of sensitive credentials (`[REDACTED]`).
- **Health Probes**: Distinguishes application liveness (`/health`) from upstream dependency readiness (`/ready` testing PostgreSQL and Redis).
- **Prometheus Metrics**: Exposes standard format counters and histograms over protected `/api/v1/metrics`.

---

## 3. Technology Stack & Directory Structure

```text
.
├── .github/
│   └── workflows/
│       └── ci.yml               # Automated CI (pytest, alembic check, vite build)
├── backend/
│   ├── Dockerfile               # Python 3.12-slim container with hot-reloading uvicorn
│   ├── requirements.txt         # FastAPI, SQLAlchemy, Alembic, Redis, PyJWT, Locust
│   ├── alembic/                 # Database migrations with explicit constraint naming
│   ├── app/
│   │   ├── main.py              # Application entrypoint & middleware assembly
│   │   ├── core/                # Config, database engine, logging, metrics, websockets
│   │   └── modules/             # Auth, Events, Registrations, Holds, Waitlist, Tickets, Certificates
│   ├── load_tests/              # Locust concurrent load testing suite & invariant runner
│   └── tests/                   # 81 Unit and PostgreSQL integration tests
├── frontend/
│   ├── Dockerfile               # Node.js 20 Alpine container
│   ├── package.json             # React 18, Vite, TypeScript, Lucide icons
│   └── src/
│       ├── api/                 # Typed API client with automated Idempotency-Key injection
│       ├── components/          # Navbar, Modals, EventCard, AttendeeView, OrganizerConsole
│       ├── context/             # AuthContext session management
│       ├── hooks/               # useEventWebSocket real-time hook
│       └── types/               # Full TypeScript type definitions
├── deploy/                      # Nginx reverse proxy configuration & scripts
├── monitoring/                  # Prometheus scraper configuration (prometheus.yml)
├── docker-compose.yml           # Development Docker Compose orchestration
└── docker-compose.prod.yml      # Production-hardened multi-worker Compose configuration
```

---

## 4. Quickstart & Local Setup

### Prerequisites
- Docker & Docker Compose (v2.20+)
- Unix shell (`zsh` or `bash`)

### 1. Initialize Environment
```bash
cp .env.example .env
```

### 2. Start Services
```bash
docker compose up -d --build
```

### 3. Verify Health & Open Applications
```bash
docker compose ps
```
- **Frontend Web Application:** [http://localhost:5173](http://localhost:5173)
- **Backend Swagger API Docs:** [http://localhost:8000/docs](http://localhost:8000/docs)
- **Application Liveness Probe:** [http://localhost:8000/health](http://localhost:8000/health)
- **Upstream Dependency Readiness Probe:** [http://localhost:8000/ready](http://localhost:8000/ready)

---

## 5. Automated Testing & Verification

### Running the Test Suite (81 Tests)
Execute all unit and integration tests inside the backend container:
```bash
docker compose exec backend pytest -v
```

### Checking Database Migration Integrity
Verify that SQLAlchemy models match the active database schema:
```bash
docker compose exec backend alembic check
```

### Building Frontend Production Bundle
Validate TypeScript compiler types and production minification:
```bash
docker compose exec frontend npm run build
```

---

## 6. Load & Concurrency Benchmark (Locust)

### Rationale: Why Locust?
Locust is a Python-native load testing framework that integrates directly into our Python 3.12 stack. It allows stateful user simulation (registration -> hold -> payment -> idempotent retry -> cancellation) using high-concurrency gevent greenlets without requiring external JavaScript runtimes.

### Executing Concurrency Load Test
Run the automated concurrency benchmark inside the container:
```bash
docker compose exec -e PYTHONPATH=. backend python load_tests/run_load_test.py
```

### Measured Benchmark Performance (20 Concurrent Users on Limited 25-Seat Event)
```text
============================================================
CAPACITY INVARIANT VERIFICATION (POSTGRESQL SINGLE SOURCE OF TRUTH)
============================================================
Target Event ID:             #648
Configured Max Capacity:     25 seats
Confirmed Registrations:     20
Active Non-Expired Holds:    0
Total Occupied Seats:        20
Capacity Remaining:          5
[+] PASS: Capacity invariant holds! Zero overselling detected.
============================================================

--- LOCUST DETAILED ENDPOINT METRICS ---
- Events: Public Get Detail                | Requests: 161   | RPS: 11.48 req/s | p50:  3 ms | p95:  9 ms
- Holds: Acquire Temporary Hold            | Requests: 327   | RPS: 23.33 req/s | p50:  6 ms | p95: 19 ms
- Idempotency: Duplicate Replay            | Requests: 526   | RPS: 37.53 req/s | p50:  7 ms | p95: 28 ms
- Registrations: Register for Event        | Requests: 695   | RPS: 49.58 req/s | p50: 11 ms | p95: 39 ms
- Total Aggregated Throughput              | Requests: 2,279 | RPS: 162.61 req/s| p50:  8 ms | p95: 37 ms
```

---

## 7. Cost-Conscious AWS Production Deployment

For complete details on AWS production setup, cost analysis, and disaster recovery runbooks, refer to [`docs/deployment-guide.md`](docs/deployment-guide.md).

### Summary of AWS Infrastructure:
- **Compute:** Single AWS EC2 instance (`t4g.small` ARM64 or `t3.small` x86_64, 2 vCPU, 2GB RAM) running Docker Compose.
- **Estimated Cost:** **~$14.71 / month** (or free under AWS Free Tier) vs **~$97.40 / month** for managed RDS + NAT Gateway + Fargate (an **85% cost reduction**).
- **Zero-Downtime Migration:**
  ```bash
  docker compose -f docker-compose.prod.yml up -d --build
  ```

---

## 8. Data Persistence, Backup & Disaster Recovery

- **PostgreSQL Volume:** Database storage is persisted in the named volume `postgres_data` mapped to `/var/lib/postgresql/data`.
- **Database Backup Command:**
  ```bash
  docker compose exec -T db pg_dump -U postgres -d event_platform | gzip > backup_$(date +%Y%m%d).sql.gz
  ```
- **Database Restore Command:**
  ```bash
  gunzip -c backup_YYYYMMDD.sql.gz | docker compose exec -T db psql -U postgres -d event_platform
  ```
- **Data Safety Rule:** Never run `docker compose down -v` unless you explicitly wish to destroy all local database volumes.

---

## 9. Security & Known Limitations

1. **Simulated Payments:** All payment endpoints (`/api/v1/holds/{id}/pay`) are strictly mock operations. No real financial credentials or payment processors (Stripe/PayPal) are integrated.
2. **In-Process BackgroundTasks:** Certificate rendering is executed using FastAPI `BackgroundTasks`. Tasks run in the ASGI worker memory; in-flight tasks do not survive unexpected container termination. For mission-critical environments, a persistent queue (Celery or ARQ backed by Redis) is recommended.
3. **Multi-Worker WebSocket Pub/Sub:** The real-time connection manager currently uses an in-memory event room dictionary. When scaling beyond a single Uvicorn process across multi-node clusters, Redis Pub/Sub should be enabled to route messages across cluster instances.
