# CoinXP

CoinXP is a personal finance web app designed to grow into a habit-building product. The project currently includes its Part 1 foundation and Part 2 cookie-based authentication. Transaction, budget, dashboard, and gamification behavior remain future work.

## Structure

```text
coinxp/
├── client/src/{components,pages,features,hooks,services,contexts,types}/
├── server/src/
│   ├── config/       # environment and constants
│   ├── controllers/  # HTTP request/response coordination
│   ├── routes/
│   ├── middleware/
│   ├── services/     # application use cases
│   ├── repositories/ # SQL access
│   ├── gamification/ # future isolated subsystem scaffold
│   ├── db/           # connection, migrations, migration runner
│   ├── utils/
│   ├── app.js        # testable Express app; does not listen
│   └── server.js     # process entry point; starts listening
└── README.md
```

## Layering rules

Request flow is **routes → controllers → services → repositories → db**. Controllers do not execute SQL. Repositories are the only layer where SQL belongs. `app.js` builds the Express app without opening a listener so it can be exercised with Supertest.

Financial operations must never fail because gamification failed. The gamification directory is only a scaffold in this phase; nothing calls it.

## Authentication

Authentication uses Argon2id password hashes and a signed JWT in an httpOnly cookie. The client never stores or reads the token; the browser sends the cookie with API requests. `AuthContext` restores the session through `GET /api/auth/me` when the app loads.

| Method | Endpoint             | Behavior                                                |
| ------ | -------------------- | ------------------------------------------------------- |
| `POST` | `/api/auth/register` | Validate and create an account, then sign in            |
| `POST` | `/api/auth/login`    | Verify credentials and sign in                          |
| `POST` | `/api/auth/logout`   | Clear the authentication cookie                         |
| `GET`  | `/api/auth/me`       | Return the current public user; requires authentication |

The cookie is `httpOnly`, `SameSite=Lax`, scoped to `/`, and expires after seven days. It is `Secure` in production. CORS allows credentials only from `CLIENT_ORIGIN`. Login and registration are rate-limited. State-changing auth routes require `Content-Type: application/json`; JSON requests plus `SameSite=Lax` are the current CSRF mitigation. Stricter CSRF tokens are planned for Phase 2.

Authentication responses contain only the public user fields `id`, `email`, `displayName`, `timezone`, and `createdAt`. Password hashes remain server-side.

**Every future protected API route must use the shared `requireAuth` middleware.** It verifies the cookie JWT, looks the user up again, and attaches only the public user object to `req.user`.

## Data conventions

- All monetary amounts are integer paise. Do not use floating-point values for money.
- `transaction_date` is the calendar date the financial activity happened (`YYYY-MM-DD`). `created_at` is the UTC timestamp when the record was entered. They represent different facts and must remain separate.
- User email is stored lowercase. User-local date handling uses the user's timezone.
- Gamification values and formulas belong only in `server/src/gamification/rules.config.js` as that subsystem is implemented.

## Run locally

1. Install Node.js 22.12 or newer and npm, then run `npm install` from the repository root.
2. Copy `.env.example` to `.env` and set values for your environment. Replace `JWT_SECRET` with a long random secret (at least 32 characters in production).
3. Run `npm run db:migrate` and `npm run db:seed`.
4. Run `npm run dev` and open <http://localhost:5173>. The landing page reports the API/database health status.

Useful commands: `npm test`, `npm run lint`, `npm run format`, `npm run db:migrate`, `npm run db:seed`, and `npm run db:reset` (development only).

The Vite development server proxies `/api` to `http://localhost:3001`. Configure the proxy through `VITE_API_PROXY_TARGET` if needed. The client can use `VITE_API_BASE_URL` when calling a separately hosted API.
