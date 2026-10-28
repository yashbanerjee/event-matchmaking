# Enterprise Matchmaking Platform

Production-oriented company & vendor matchmaking, configurable onboarding, meeting scheduling, and outcome tracking.

## Stack

- **Frontend:** Next.js App Router, React, TypeScript, Tailwind CSS
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

Seed admin defaults: `ADMIN_EMAIL` / `ADMIN_PASSWORD` (see `.env.example`).

## Railway

Deploy **api**, **worker**, and **web** as three services from this repo. See **[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)** for Dockerfiles, env vars, Redis/RabbitMQ, and domains.

Dockerfiles:

- `infra/docker/Dockerfile.api`
- `infra/docker/Dockerfile.worker`
- `infra/docker/Dockerfile.web`

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
