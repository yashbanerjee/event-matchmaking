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

## Phase 6 — Analytics & production readiness (partial)

- Admin dashboard metrics from live DB
- Participant portal
- Architecture + runbook documentation
- Remaining: broader e2e suite, performance report artifacts, full shadcn component library polish

## Known limitations

- PostgreSQL exclusion constraint SQL should be applied after schema sync (see `prisma/sql/001_meeting_occupancy_exclusion.sql`).
- Email provider defaults to console/worker logging; configure SMTP/SendGrid for production.
- Object storage defaults to local filesystem adapter path (S3 config present, adapter wiring next).
- Semantic search and advanced AI providers are stubs behind feature flags.
- Bulk invitation CSV import UI not yet built (API pattern ready via invitations module).
