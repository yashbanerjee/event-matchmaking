# Deployment — Local & Railway

## Architecture (3 app services + infra)

| Service | Role | `SERVICE_TYPE` | Folder |
| --- | --- | --- | --- |
| **api** | NestJS REST (`/api/v1`) | `api` | `apps/api` |
| **worker** | RabbitMQ consumers | `worker` | `apps/worker` |
| **web** | Next.js UI | `web` | `apps/web` |

One root `Dockerfile` builds/starts the folder matching `SERVICE_TYPE`.
| Postgres | Primary data store | Railway Postgres / Compose |
| Redis | Sessions / cache / readiness | Railway Redis / Compose |
| RabbitMQ | Async jobs / outbox | Railway RabbitMQ or CloudAMQP / Compose |

Email, storage, AI, and ops flags are configured in **Admin → System Settings** (not `.env`).

---

## Local development

1. Copy env and start infra:

```bash
cp .env.example .env
npm install
npm run docker:up
```

2. Point `DATABASE_URL` in `.env` at either:
   - **Local Compose Postgres:** `postgresql://em:em_secret@localhost:5433/event_matchmaking?schema=public`
   - **Railway public URL:** your Railway Postgres connection string

3. Migrate + seed:

```bash
npm run prisma:migrate:deploy
npm run db:seed
# optional occupancy constraint:
# Get-Content prisma/sql/001_meeting_occupancy_exclusion.sql | docker exec -i em-postgres psql -U em -d event_matchmaking
```

4. Run apps (three terminals):

```bash
npm run build:packages
npm run dev:api
npm run dev:worker
npm run dev:web
```

Or production-like locally:

```bash
npm run build:api && npm run start:api
npm run build:worker && npm run start:worker
npm run build:web && npm run start:web
```

- Web: http://localhost:3000  
- API: http://localhost:4000/api/v1/health/live  
- Docs (non-prod): http://localhost:4000/api/docs  

Default seeded admin: set via `ADMIN_EMAIL` / `ADMIN_PASSWORD` (defaults `info@vedha.ae`).

---

## Railway deploy

### 1. Create project & plugins

1. New Railway project.
2. Add **Postgres** (you can use the existing DB already migrated).
3. Add **Redis**.
4. Add **RabbitMQ** (Railway template/image) or an external AMQP URL (e.g. CloudAMQP).

### 2. Create three services from this repo

For each service: **New → GitHub Repo** (same repo), then set:

All three use the **root `Dockerfile`**. On each Railway service set:

| Service | Variable (build + runtime) | Notes |
| --- | --- | --- |
| api | `SERVICE_TYPE=api` | Health `/api/v1/health/live` |
| worker | `SERVICE_TYPE=worker` | No public HTTP |
| web | `SERVICE_TYPE=web` | Also build-arg `NEXT_PUBLIC_API_URL` |

Mark `SERVICE_TYPE` as **Available at Build Time** on Railway so Docker builds the correct folder.

Optional Config-as-code: `infra/railway/api.toml` (or `web.toml` / `worker.toml`).

### 3. Environment variables per service

Copy-paste templates live in:

- `infra/railway/api.env.example`
- `infra/railway/worker.env.example`
- `infra/railway/web.env.example`

#### API (required)

| Variable | Example / note |
| --- | --- |
| `NODE_ENV` | `production` |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
| `REDIS_URL` | `${{Redis.REDIS_URL}}` |
| `RABBITMQ_URL` | `${{RabbitMQ.URL}}` or CloudAMQP URL |
| `JWT_ACCESS_SECRET` | min 32 chars (same as local `.env`) |
| `JWT_REFRESH_SECRET` | min 32 chars (same as local `.env`) |
| `APP_URL` | `https://<web-domain>` |
| `API_URL` | `https://<api-domain>` |
| `CORS_ORIGINS` | `https://<web-domain>` (comma-separated if multiple) |

Recommended: `APP_NAME`, `LOG_LEVEL`, `RABBITMQ_EXCHANGE`, `RABBITMQ_PREFETCH`, `JWT_ACCESS_TTL`, `JWT_REFRESH_TTL`, `BCRYPT_COST`, `INVITATION_TTL_DAYS`, `SESSION_COOKIE_NAME`, `DATABASE_POOL_SIZE`.

`PORT` is injected by Railway; API uses it automatically.

#### Worker (required)

| Variable | Example / note |
| --- | --- |
| `NODE_ENV` | `production` |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (same DB as API) |
| `RABBITMQ_URL` | same as API |

Recommended: `LOG_LEVEL`, `RABBITMQ_PREFETCH`, `EMAIL_PROVIDER`.

Worker does **not** need JWT, Redis, `APP_URL`, `API_URL`, `CORS_ORIGINS`, or `PORT`.

#### Web (required)

| Variable | When | Example / note |
| --- | --- | --- |
| `NEXT_PUBLIC_API_URL` | **Build** | `https://<api-domain>/api/v1` |
| `NODE_ENV` | Runtime | `production` |

`PORT` is injected by Railway. Web does **not** need database, Redis, RabbitMQ, or JWT secrets.

Email / storage / AI / ops are set in **Admin → System Settings**, not service env.

### 4. First deploy

1. Deploy **api** — startup runs `prisma migrate deploy` then Nest.
2. Deploy **worker**.
3. Deploy **web** with `NEXT_PUBLIC_API_URL` pointing at the API public URL.
4. Seed once (Railway shell on api, or local against public DB):

```bash
DATABASE_URL="postgresql://..." ADMIN_EMAIL=info@vedha.ae ADMIN_PASSWORD='***' npm run db:seed
```

5. Open web URL → sign in → configure email/storage/AI under **System Settings**.

### 5. Domains

Attach custom domains to **web** and **api**. Keep `CORS_ORIGINS` and `APP_URL` / `API_URL` / `NEXT_PUBLIC_API_URL` in sync.

---

## Docker build smoke tests (optional)

```bash
docker build -f infra/docker/Dockerfile.api -t em-api .
docker build -f infra/docker/Dockerfile.worker -t em-worker .
docker build -f infra/docker/Dockerfile.web --build-arg NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1 -t em-web .
```
