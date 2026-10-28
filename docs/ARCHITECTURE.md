# Enterprise Matchmaking Platform — Architecture Assessment

## 1. Existing Codebase Summary

The repository was empty at inspection time (git initialized on `main` with no commits and no application source). This document defines the greenfield architecture and implementation plan. All subsequent phases build on this foundation.

## 2. Architecture Assessment

### Chosen topology

| Layer | Choice | Rationale |
| --- | --- | --- |
| Frontend | Next.js App Router (TypeScript, Tailwind, shadcn/ui) | Role-based portals (admin / company / vendor) with SSR-friendly auth boundaries |
| API | NestJS modular monolith | Clear domain modules; workers share domain packages without premature microservices |
| Workers | NestJS worker process consuming RabbitMQ | Separately deployable; same Prisma schema and domain services |
| DB | PostgreSQL + Prisma | Authoritative persistence, constraints, exclusion ranges for scheduling |
| Queue | RabbitMQ + transactional outbox | Durable jobs with idempotent consumers |
| Cache | Redis | Non-authoritative cache, rate limits, coordination only |
| Integrations | Adapter interfaces | AI / email / storage / search swappable with fallbacks |

### Architectural principles (enforced in code)

1. PostgreSQL is the only source of truth for business records.
2. RabbitMQ transports jobs/events; critical publishes go through an outbox.
3. Redis never stores authoritative business state.
4. Deterministic matchmaking works without AI; AI is optional enrichment.
5. Scheduling optimizer is independent of scoring.
6. Frontend never owns authorization or matching rules.
7. All mutations use explicit transactions and idempotency keys where needed.

### Deployable units

- `apps/api` — HTTP REST API
- `apps/worker` — RabbitMQ consumers (matchmaking, email, profile, reports)
- `apps/web` — Next.js portals
- `packages/shared` — Zod DTOs, enums, permission constants
- `packages/domain` — pure scoring / scheduling algorithms (unit-testable)

## 3. Proposed Folder Structure

```
event-matchmaking/
├── apps/
│   ├── api/                 # NestJS REST API
│   ├── worker/              # NestJS RabbitMQ workers
│   └── web/                 # Next.js App Router frontend
├── packages/
│   ├── shared/              # Shared types, Zod schemas, RBAC constants
│   └── domain/              # Pure matchmaking & scheduling logic
├── prisma/                  # Shared Prisma schema & migrations
├── infra/
│   ├── docker/              # Dockerfiles, compose overlays
│   ├── backup/              # Backup/restore scripts
│   └── monitoring/          # Prometheus/Grafana stubs
├── scripts/                 # Dev, seed, restore helpers
├── docs/                    # Architecture, runbooks, decisions
├── .github/workflows/       # CI
├── docker-compose.yml
├── package.json             # npm workspaces root
└── README.md
```

## 4. Database Entity Relationship Design (logical)

```
User ──< UserRole >── Role ──< RolePermission >── Permission
User ──< OrganizationMember >── Organization
Organization ── Company | Vendor (1:1 subtype via organizationType)

Invitation ──> Organization, Role, OnboardingWorkflow, User(createdBy)
Invitation.status: PENDING|SENT|DELIVERED|ACCEPTED|EXPIRED|REVOKED|FAILED

OnboardingWorkflow ──< WorkflowVersion
Form ──< FormVersion ──< FormField
FormAssignment ──> FormVersion, Organization|User
FormSubmission ──> FormVersion, User, Organization (immutable version ref)
FormResponse (JSONB answers + structured extracts)

CompanyProfile / VendorProfile (normalized, versioned)
ParticipantPreference, AvailabilityWindow

MatchingRule ──< MatchingRuleVersion (weights, thresholds)
MatchmakingRun (status lifecycle) ──< MatchCandidate ── Match
ScheduleVersion ── MeetingSlot ── Meeting
Meeting ── MeetingParticipant, MeetingConfirmation, MeetingStatusHistory
Meeting ── MeetingFeedback (per organization), FollowUpAction

Document (object storage metadata)
NotificationEvent ── NotificationDelivery
OutboxEvent, JobExecutionRecord
AuditLog, SystemSetting, FeatureFlag, IntegrationHealthEvent
```

Concurrency for meetings: participant occupancy modeled with `tstzrange` + PostgreSQL exclusion constraints (via raw SQL migration) so overlapping meetings for the same participant cannot commit.

## 5. Business Decisions Needing Confirmation

| ID | Decision | Default assumption until confirmed |
| --- | --- | --- |
| BD-01 | Multi-tenancy model | Single deployment / single event-program tenant; org isolation via `organizationId` |
| BD-02 | Meeting mode default | Virtual by default; venue optional |
| BD-03 | Daily slots | 6 slots, 30-minute meetings, 10-minute buffer (configurable) |
| BD-04 | Profile change after publish | Mark matching inputs stale; do **not** auto-rewrite published schedule |
| BD-05 | Feedback visibility | Confidential to admins; counterpart sees only non-confidential summary fields |
| BD-06 | AI data policy | AI disabled by default; no PII/form raw answers sent without flag |
| BD-07 | Password policy | Min 12 chars, complexity rules, bcrypt cost 12 |
| BD-08 | Invitation TTL | 7 days |
| BD-09 | RPO / RTO | RPO ≤ 24h (daily encrypted backups); RTO ≤ 4h (documented restore) |
| BD-10 | Duplicate pairings | Same company–vendor pair at most once per schedule version unless override |

## 6. Risk Assessment

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Scheduling race conditions | Double-booked meetings | Exclusion constraints + transactions + optimistic versioning |
| AI dependency | Matching blocked | Deterministic engine is primary; AI optional |
| Queue loss | Missed notifications | Transactional outbox + DLQ + admin job console |
| Schema complexity | Slow delivery | Phased migrations; JSONB only for flexible form answers |
| Large candidate sets | Slow matchmaking | Indexed eligibility filters + background jobs + pagination |
| Secret leakage | Security breach | Env validation at boot; no secrets in repo; audit scrubbing |
| Empty-repo greenfield scope | Incomplete deliverable | Strict phases with tests after each phase |

## 7. Phased Implementation Plan

| Phase | Focus | Exit criteria |
| --- | --- | --- |
| 1 | Foundation: monorepo, Docker, Prisma, NestJS, Next.js, auth/RBAC, health, CI | Bootable stack, migrations apply, login works, CI green |
| 2 | Orgs, invitations, form builder, submissions, documents, profiles | Invite → register → submit form → normalized profile |
| 3 | Matching rules, scoring, optimizer, runs, preview/publish, manual overrides | Explainable scores + conflict-free schedule |
| 4 | Meeting lifecycle, confirmations, feedback, follow-ups | Full post-meeting loop |
| 5 | Outbox, retries/DLQ, AI adapters, query fallback, backups | Degraded-mode continuity proven by tests |
| 6 | Dashboards, reports, e2e, performance notes, runbooks | Acceptance checklist satisfied |

---

Implementation of Phase 1 begins immediately after this document.
