# Deployment notes

## Current container path

The `Dockerfile` builds the Vite client, installs production server dependencies, runs as the unprivileged `node` user, and exposes port 3001. Mount a persistent writable volume at `/data`. At startup, `docker-entrypoint.sh` takes a SQLite online backup under `/data/backups`, applies pending migrations, then starts Express. In production, Express serves `client/dist` from the same origin, with immutable caching for assets and `no-cache` for the HTML entry point.

Build and run:

```sh
docker build -t coinxp:local .
docker run --name coinxp --restart unless-stopped -p 3001:3001 \
  -v coinxp-data:/data \
  -e JWT_SECRET='<32+ character secret>' \
  -e PUBLIC_ORIGIN='https://coinxp.example' \
  -e TRUST_PROXY='1' \
  -e OPS_HEALTH_TOKEN='<operations bearer token>' \
  coinxp:local
```

Set `PUBLIC_ORIGIN` to the browser-visible HTTPS origin and `TRUST_PROXY` to the actual reverse-proxy hop count/list. `TRUST_PROXY=0` is appropriate only when the app is not behind a trusted proxy. `CLIENT_ORIGIN` defaults to the container origin; production disables CORS. `DB_PATH` and `BACKUP_DIR` default under `/data`.

## Current limits

This is single-instance SQLite groundwork. A nightly off-host encrypted backup, retention policy, restore rehearsal, automated migration rehearsal, blue/green deployment, pinned image digest, SBOM/container scans, and production hosting setup are not configured. The entrypoint backup is local to `/data` and runs at every container start; it is not a replacement for a backup service. Account deletion runs on the single scheduler-enabled instance, so keep exactly one such instance. Do not expose the app to real customer data until these gaps and the items in [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md) are closed.
