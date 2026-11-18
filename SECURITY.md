# Security notes

## Current application controls

- Authentication uses Argon2id and a signed, httpOnly cookie. Production uses `__Host-coinxp`, `Secure`, `SameSite=Lax`, `Path=/`, and no `Domain` attribute.
- Password changes require the current password, use Argon2id, reject password reuse, and increment a per-user token version so existing sessions are invalidated.
- Production requires a 32-character JWT secret, exact `PUBLIC_ORIGIN`, and explicit `TRUST_PROXY` configuration. Set the proxy value to the actual number of trusted hops or an explicit trusted proxy list; do not set it to `true` behind an untrusted network.
- Production disables CORS. State-changing requests must have a matching `Origin` or `Referer`, and JSON-only request checks remain active.
- Production CSP limits scripts, connections, images, fonts, and frames to the application origin. `style-src-attr 'unsafe-inline'` is allowed for Motion-driven inline styles.
- Request logs contain method, path, status, and duration only. Do not add request bodies, credentials, cookies, amounts, or transaction descriptions to logs.
- Operational details require `OPS_HEALTH_TOKEN` as a bearer token. Rotate it through the deployment secret store; do not put it in a client build.
- `POST /api/test/clock` only exists in a test process with `ENABLE_TEST_CLOCK=1` and an injected adjustable clock. Production refuses this flag at startup.

## Production environment

Set `NODE_ENV=production`, `JWT_SECRET` (32+ characters), `PUBLIC_ORIGIN` (exact HTTPS origin without a path), `TRUST_PROXY`, `DB_PATH`, `PORT`, and `CLIENT_ORIGIN`. Provide a high-entropy `OPS_HEALTH_TOKEN` if the operations endpoint is enabled. Keep `.env` and all production secrets outside source control and the client bundle.

## Known release gaps

Part 10 remains in progress. Scheduled account deletion and restoration, automated off-host backup/restore, deployment rehearsal, and the broader authorization/security automation are not complete yet. Do not treat this repository as release-ready or expose it to untrusted production traffic until those items have been designed, implemented, tested, and reviewed. No responsible disclosure email address has been configured in this repository yet.
