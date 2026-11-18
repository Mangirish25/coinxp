# Operations runbook

## Health checks

- `GET /api/health` is public liveness and runs a trivial SQLite query.
- `GET /api/ready` checks DB reachability and that all bundled migrations are applied. If the scheduler is enabled, its most recent completed cycle must be within five minutes.
- `GET /api/health/details` requires `Authorization: Bearer $OPS_HEALTH_TOKEN`. It reports counts and timestamps only; `lastBackupAt` remains `null` until a backup registry is added.

Check container state and logs through the hosting platform. Application request logs contain method, path, response status and duration; never add bodies, cookies, credentials, amounts, or descriptions.

## SQLite and migrations

Keep `/data` persistent and writable by the container's `node` user. The entrypoint takes an online backup before running migrations. Copy a backup off-host before maintenance and verify its integrity before restoring it. Do not delete WAL/SHM files while the server is running. Run only one scheduler-enabled instance against a SQLite file.

For local development, use `npm run db:migrate` and the documented development reset workflow. Production migrations are forward-only; take and verify a backup before applying a new image.

## Known operational gaps

There is no scheduled backup upload/retention/restore-check or alerting integration. Account deletion grace periods are purged by the gamification scheduler process even when gamification is disabled; ensure one scheduler-enabled server instance is running. The public readiness endpoint does not verify an external backup age. Treat on-call response, restore time, and RPO/RTO as unproven until a rehearsal is recorded.
