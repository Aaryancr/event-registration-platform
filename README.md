# EventFlow — Event Registration & Ticketing Platform

A modern, production-minded event registration and ticketing platform built with a high-throughput backend and an interactive frontend.

- **Backend:** Python 3.12, FastAPI, Pydantic v2, SQLAlchemy 2.0, Alembic, PostgreSQL 16, Redis 7
- **Frontend:** React 18, Vite, TypeScript
- **Testing:** pytest, httpx
- **Infrastructure:** Docker, Docker Compose

---

## Architecture & Monorepo Structure

```text
.
├── .env.example              # Environment variables template with sensible development defaults
├── .gitignore                # Excludes secrets (.env), caches, builds, and node_modules
├── docker-compose.yml        # Development environment services: PostgreSQL, Redis, Backend, Frontend
├── README.md                 # Setup, operations, and development instructions
├── backend/
│   ├── Dockerfile            # Python 3.12-slim container with hot-reloading uvicorn
│   ├── requirements.txt      # FastAPI, SQLAlchemy, Alembic, Redis, PyJWT, bcrypt, pytest
│   ├── alembic.ini           # Alembic database migration configuration
│   ├── alembic/
│   │   ├── env.py            # Migration runner reading connection strings from settings
│   │   └── versions/         # Alembic database migration revisions
│   ├── app/
│   │   ├── main.py           # FastAPI entry point, CORS middleware, and health endpoints
│   │   ├── core/
│   │   │   ├── config.py     # Pydantic BaseSettings loading from environment
│   │   │   └── database.py   # SQLAlchemy 2.0 engine and sessionmaker
│   │   └── modules/          # Domain-driven feature modules (Auth, Events, Tickets)
│   └── tests/
│       ├── conftest.py       # Pytest fixtures and TestClient
│       ├── unit/             # Isolated unit tests
│       │   └── test_health.py
│       └── integration/      # Integration test suites against services
├── docs/                     # Architectural decision records and technical documentation
└── frontend/
    ├── Dockerfile            # Node.js 20 Alpine container with Vite development server
    ├── package.json          # React 18, Vite, TypeScript, and Lucide icons
    ├── tsconfig.json         # TypeScript compiler configuration
    ├── vite.config.ts        # Vite configuration (host 0.0.0.0, port 5173, polling)
    ├── index.html            # Entry HTML with Inter & Outfit typography
    ├── public/               # Static assets
    └── src/
        ├── main.tsx          # React application root mount
        ├── App.tsx           # Platform foundation status dashboard and telemetry
        └── index.css         # Modern design system (dark glassmorphism, responsive)
```

---

## Services & Ports Summary

All development ports are bound strictly to `127.0.0.1` (localhost) to avoid unwanted network exposure.

| Service | Container Name | Host Port | Internal Port | Healthcheck | URL / Protocol |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Frontend** | `frontend` | `5173` | `5173` | Via HTTP | [http://localhost:5173](http://localhost:5173) |
| **Backend API** | `backend` | `8000` | `8000` | `curl -f /health` | [http://localhost:8000](http://localhost:8000) |
| **Swagger UI** | `backend` | `8000` | `8000` | — | [http://localhost:8000/docs](http://localhost:8000/docs) |
| **ReDoc** | `backend` | `8000` | `8000` | — | [http://localhost:8000/redoc](http://localhost:8000/redoc) |
| **PostgreSQL** | `db` | `5433`* | `5432` | `pg_isready` | `postgresql://localhost:5433/event_platform` |
| **Redis** | `redis` | `6379` | `6379` | `redis-cli ping` | `redis://localhost:6379/0` |

*\* Note: Host port `5433` is used for PostgreSQL to prevent collision with local PostgreSQL instances occupying port 5432.*

### Container-to-Container Networking

When containers talk to each other inside the Docker network, they use **Docker Compose service names** rather than `localhost`:
- Backend connects to PostgreSQL via `db:5432`.
- Backend connects to Redis via `redis:6379`.
- Frontend browser connects to Backend via `http://localhost:8000` (or `http://127.0.0.1:8000`).

---

## Prerequisites

- **Docker** and **Docker Compose** (Docker Desktop or Docker Engine with Compose v2)
- Unix shell (`zsh` or `bash`)

---

## Getting Started

### 1. Initialize Environment Variables

Copy the provided `.env.example` file to `.env`:

```bash
cp .env.example .env
```

Review `.env` to verify port mappings and database credentials:
- `POSTGRES_USER`: Database superuser username (default: `postgres`)
- `POSTGRES_PASSWORD`: Database superuser password (default: `postgres`)
- `POSTGRES_DB`: Default database name (default: `event_platform`)
- `POSTGRES_PORT`: Host port mapping (default: `5433`)
- `REDIS_PORT`: Host port mapping (default: `6379`)
- `BACKEND_PORT`: Host port mapping (default: `8000`)
- `FRONTEND_PORT`: Host port mapping (default: `5173`)
- `ENVIRONMENT`: Runtime environment (default: `development`)

> **Security Note:** The `.env` file is excluded from Git tracking via `.gitignore`. Never commit secrets or credentials.

### 2. Build and Start Services

Start all 4 services in detached background mode:

```bash
docker compose up -d --build
```

### 3. Check Service Status & Health

Verify that all containers are healthy and running:

```bash
docker compose ps
```

All 4 services should report `Up ... (healthy)` or `Up`:
```text
NAME                                  STATUS                   PORTS
event-registration-platform-backend-1   Up (healthy)             127.0.0.1:8000->8000/tcp
event-registration-platform-db-1        Up (healthy)             127.0.0.1:5433->5432/tcp
event-registration-platform-frontend-1  Up                       127.0.0.1:5173->5173/tcp
event-registration-platform-redis-1     Up (healthy)             127.0.0.1:6379->6379/tcp
```

### 4. Open Application Endpoints

- **Frontend Dashboard:** [http://localhost:5173](http://localhost:5173)
- **Backend API Health:** [http://localhost:8000/health](http://localhost:8000/health)
- **Interactive Swagger Docs:** [http://localhost:8000/docs](http://localhost:8000/docs)

---

## Development Operations

### Running Tests

Execute the backend test suite inside the running container:

```bash
docker compose exec backend pytest -v
```

### Viewing Logs

View combined logs across all services:

```bash
docker compose logs -f
```

View logs for an individual service:

```bash
docker compose logs -f backend
docker compose logs -f frontend
docker compose logs -f db
docker compose logs -f redis
```

### Stopping the Environment

To stop running containers without losing data:

```bash
docker compose stop
```

To stop and remove containers and network:

```bash
docker compose down
```

---

## Data Persistence & Safety

- **PostgreSQL Volume:** Database storage is persisted in the named volume `postgres_data` mapped to `/var/lib/postgresql/data`.
- **Redis Volume:** In-memory append-only persistence is saved in `redis_data` mapped to `/data`.
- **Preserving Data:** Running `docker compose down` removes containers and networks but **preserves `postgres_data` and `redis_data` volumes**. On the next `docker compose up -d`, all data is restored.
- **Data Loss Warning:** **Never** execute `docker compose down -v` or `docker compose down --volumes` unless you intend to completely erase all local database data and volumes.

---

## Troubleshooting

### 1. Port 5432 Address Already in Use
If the host has another PostgreSQL instance running on port 5432, `.env` should keep `POSTGRES_PORT=5433`. The container's internal port stays `5432` while publishing on `127.0.0.1:5433`.

### 2. Missing Environment Variables
If required environment variables (`POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`) are unset or empty, Compose prevents execution:
```text
error while interpolating services.db.environment.POSTGRES_DB: required variable POSTGRES_DB is missing a value
```
Ensure `.env` exists and contains non-empty values.

### 3. Loopback (127.0.0.1) Port Exposure
All published ports use `127.0.0.1:${PORT}:${PORT}` to prevent exposing backend, database, and cache services to external LAN interfaces.
