# Phase Status

## Phase 1 — Foundation (implemented)

- npm workspaces monorepo (`apps/api`, `apps/worker`, `apps/web`, `packages/*`)
- Docker Compose: PostgreSQL, Redis, RabbitMQ, Mailpit
- Prisma schema covering core enterprise entities
- NestJS API with env validation, helmet, throttling, structured logs
- JWT auth, RBAC permissions, invitation registration
- Health live/ready checks
- CI workflow scaffold

## Phase 2 — Organizations & onboarding (implemented core)

- Company/vendor CRUD + vendor approval
- Invitations with hashed tokens + transactional outbox
- Form builder with versioning, publish, assignment, submission validation
- Profile normalization from submissions

## Phase 3 — Matchmaking & scheduling (implemented core)

- Deterministic weighted scoring (`@em/domain`)
- Hard eligibility rules
- Greedy scheduler with conflict avoidance
- Matchmaking runs, preview persistence, publish workflow
- Manual assignment with required reason

## Phase 4 — Meetings & feedback (implemented core)

- Meeting list (org-scoped), confirm, reschedule request
- Independent feedback with confidentiality enforcement
- Follow-up action creation

## Phase 5 — Reliability (implemented foundation)

- RabbitMQ publisher confirms + worker consumers
- Outbox pattern, job execution records, DLQ bindings
- AI provider interface with null/disabled fallback
- Encrypted backup/restore scripts

## Phase 6 — Analytics & production readiness

- Admin dashboard metrics from live DB
- Full admin navigation (19 sections) + shadcn-style UI kit
- Reports summary + CSV exports + async report enqueue
- Email adapters: console / SMTP / SendGrid
- Storage adapters: local / S3 (signed URLs)
- AI providers: OpenAI + Anthropic with circuit breaker + schema validation
- Semantic search with structured fallback
- Lifecycle e2e + performance probes
- Architecture + runbook documentation

## Known limitations / external setup

- PostgreSQL exclusion constraint SQL should be applied after schema sync (`prisma/sql/001_meeting_occupancy_exclusion.sql`).
- Configure email, storage, AI, and ops in **Admin → System Settings** (not `.env`).
- Bulk invitation CSV import UI not yet built (API pattern ready via invitations module).
- Malware scanning marks documents `PENDING`/`SKIPPED` until a scanner is configured.
