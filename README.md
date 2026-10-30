# Enterprise Matchmaking Platform

Production-oriented company & vendor matchmaking, configurable onboarding, meeting scheduling, and outcome tracking.

## Stack

- **Frontend:** Next.js App Router, React, TypeScript, Tailwind CSS
- **Mobile:** Flutter (`mobile/`) — Ethara client/guest app with Firebase push + analytics
- **API:** NestJS, Prisma, PostgreSQL, RabbitMQ, Redis
- **Workers:** Node RabbitMQ consumer
- **Domain:** Pure TypeScript scoring & scheduling (`packages/domain`)

## Quick start (local)

```bash
cp .env.example .env
npm install
npm run docker:up
npm run prisma:migrate:deploy
npm run db:seed
npm run build:packages
```

Run in three terminals:

```bash
npm run dev:api
npm run dev:worker
npm run dev:web
```

> Compose maps Postgres to host port **5433**. You can also set `DATABASE_URL` to a Railway public Postgres URL and keep Redis/RabbitMQ local.

- Web: http://localhost:3000
- API health: http://localhost:4000/api/v1/health/live
- API docs (dev): http://localhost:4000/api/docs
- RabbitMQ UI: http://localhost:15672 (`em` / `em_secret`)
- Mailpit: http://localhost:8025

### Mobile (Flutter)

```bash
cd mobile
flutter pub get
flutter run --dart-define=API_BASE=http://10.0.2.2:4000/api/v1
```

See [`mobile/README.md`](mobile/README.md) for Firebase production setup.

Seed admin defaults: `ADMIN_EMAIL` / `ADMIN_PASSWORD` (see `.env.example`).

## Railway

Deploy **api**, **worker**, and **web** as three services from this repo. See **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** for Dockerfiles, env vars, Redis/RabbitMQ, and domains.

One root `Dockerfile` — each Railway service sets `SERVICE_TYPE=api|web|worker` (build + runtime) to deploy `apps/<type>`.

## Documentation

- [Deployment (local + Railway)](docs/DEPLOYMENT.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Phase status](docs/PHASE_STATUS.md)
- [Runbooks](docs/RUNBOOKS.md)

## Tests

```bash
npm run test -w @em/domain
npm run test -w @em/api
npm run test:e2e -w @em/api
```

## Settings

Email, storage, AI, and ops are managed in **Admin → System Settings** (not `.env`).
