# Performance probes

Recorded with `npm run test:perf -w @em/api` on a development Windows host against Docker Postgres.

| Probe | Condition | Example result |
| --- | --- | --- |
| Deterministic score 5k pairs | single-thread Node, in-memory | ~35–45 ms |
| Dashboard overview | seeded DB (~7 companies/vendors after e2e) | ~50 ms |
| 20 concurrent meeting list requests | Nest test HTTP server | ~100 ms |

Do not treat these as production capacity guarantees. Re-run under target hardware and data volume before capacity planning.
