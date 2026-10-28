# Enterprise Matchmaking Platform

Production-oriented company & vendor matchmaking, configurable onboarding, meeting scheduling, and outcome tracking.

## Stack

- **Frontend:** Next.js App Router, React, TypeScript, Tailwind CSS
- **API:** NestJS, Prisma, PostgreSQL, RabbitMQ, Redis
- **Workers:** NestJS/Node consumer process
- **Domain:** Pure TypeScript scoring & scheduling (`packages/domain`)

## Quick start

```bash
cp .env.example .env
npm install
npm run docker:up
npx prisma db push
npx prisma db seed
Get-Content prisma/sql/001_meeting_occupancy_exclusion.sql | docker exec -i em-postgres psql -U em -d event_matchmaking
npm run build -w @em/shared && npm run build -w @em/domain
npm run dev:api
# other terminals:
npm run dev:worker
npm run dev:web
```

> Note: Compose maps Postgres to host port **5433** (to avoid local 5432 conflicts).

- Web: http://localhost:3000
- API docs: http://localhost:4000/api/docs
- RabbitMQ UI: http://localhost:15672 (em / em_secret)
- Mailpit: http://localhost:8025

Default admin: `admin@example.com` / `ChangeMeAdmin1!`

## Documentation

- [Architecture assessment](docs/ARCHITECTURE.md)
- [Phase status](docs/PHASE_STATUS.md)
- [Runbooks](docs/RUNBOOKS.md)

## Acceptance highlights already wired

| Capability | Location |
| --- | --- |
| Invite + hashed tokens + outbox | `apps/api/src/invitations` |
| Secure registration | `apps/api/src/auth` |
| Configurable forms + immutable versions | `apps/api/src/forms` |
| Deterministic explainable matching | `packages/domain`, `apps/api/src/matchmaking` |
| Schedule persist then publish | `MatchmakingService.publishSchedule` |
| Manual assign with reason | `MatchmakingService.manualAssign` |
| Independent confidential feedback | `apps/api/src/meetings` |
| RabbitMQ + DLQ + job records | `apps/worker`, compose definitions |
| AI optional / null fallback | `apps/api/src/integrations/ai` |
| Encrypted backup scripts | `infra/backup` |

## Tests

```bash
npm run test -w @em/domain
npm run test -w @em/api
npm run test:e2e -w @em/api
npm run test:perf -w @em/api
```

Latest local performance probes (example): score 5k pairs ~35–45ms; dashboard ~50ms; 20 concurrent meeting lists ~100ms. These are not production capacity claims.

## Production adapters

| Concern | Env |
| --- | --- |
| Email | `EMAIL_PROVIDER=console\|smtp\|sendgrid` + SMTP_* or `SENDGRID_API_KEY` |
| Storage | `STORAGE_PROVIDER=local\|s3` + `S3_BUCKET` / region / keys |
| AI | `AI_ENABLED=true`, `AI_PRIMARY_PROVIDER=openai\|anthropic`, API keys |
| Semantic search | `FEATURE_SEMANTIC_SEARCH=true` (falls back to structured filters) |

## Environment

All required variables are listed in `.env.example` and validated at API startup via Zod.
