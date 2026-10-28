# Operational Runbooks

## Recovery objectives (defaults)

- **RPO:** 24 hours (daily encrypted backups; increase frequency for tighter RPO)
- **RTO:** 4 hours (restore to isolated environment, validate, then cut over)

These are operational targets, not infrastructure guarantees.

## PostgreSQL restore procedure

1. Identify the failure and freeze writes if needed.
2. Select a suitable encrypted backup and passphrase.
3. Provision an isolated PostgreSQL instance.
4. Run `infra/backup/restore-postgres.sh` against `RESTORE_DATABASE_URL`.
5. Validate migrations / schema (`prisma migrate status`).
6. Verify critical records: users, organizations, published schedules, meetings, feedback.
7. Point a staging API/worker at the restored DB and run health checks.
8. Coordinate production cutover only after sign-off.
9. Record the recovery event in audit/ops notes.

## RabbitMQ unavailable

1. API continues to write business data + outbox rows.
2. Outbox publisher retries when RabbitMQ recovers.
3. Do not claim jobs were queued unless publish succeeded.
4. Monitor `outbox_events` with `status=PENDING|FAILED`.

## AI providers unavailable

1. Keep `AI_ENABLED=false` or allow provider failures.
2. Deterministic matching and manual scheduling remain available.
3. Record degraded operation via health endpoint / logs.

## Conflicting meetings

Exclusion/occupancy rows plus application conflict checks prevent overlaps.
If a conflict error is returned, use manual reschedule with an explicit reason.

## Invitation delivery failure

1. Check `job_execution_records` and `notification_deliveries`.
2. Use admin resend (re-queue outbox) after fixing provider credentials.
3. Tokens remain hashed; only a new invitation issues a new plaintext token.
