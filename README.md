# CoinXP

CoinXP is a personal finance web app foundation designed to grow into a habit-building product. This repository currently contains the Part 1 monorepo skeleton, SQLite schema and migrations, shared utilities, and a minimal full-stack health check. Financial features and authentication are intentionally not implemented yet.

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

## Data conventions

- All monetary amounts are integer paise. Do not use floating-point values for money.
- `transaction_date` is the calendar date the financial activity happened (`YYYY-MM-DD`). `created_at` is the UTC timestamp when the record was entered. They represent different facts and must remain separate.
- User email is stored lowercase. User-local date handling uses the user's timezone.
- Gamification values and formulas belong only in `server/src/gamification/rules.config.js` as that subsystem is implemented.

## Run locally

1. Install Node.js and npm, then run `npm install` from the repository root.
2. Copy `.env.example` to `.env` and set values for your environment. `JWT_SECRET` is a placeholder for the later authentication phase.
3. Run `npm run db:migrate` and `npm run db:seed`.
4. Run `npm run dev` and open <http://localhost:5173>. The landing page reports the API/database health status.

Useful commands: `npm test`, `npm run lint`, `npm run format`, `npm run db:migrate`, `npm run db:seed`, and `npm run db:reset` (development only).

The Vite development server proxies `/api` to `http://localhost:3001`. Configure the proxy through `VITE_API_PROXY_TARGET` if needed. The client can use `VITE_API_BASE_URL` when calling a separately hosted API.
