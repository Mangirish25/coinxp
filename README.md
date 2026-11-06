# CoinXP

CoinXP is a personal finance web app designed to grow into a habit-building product. It currently includes the project foundation, cookie-based authentication, transaction and category management, budgets, and an on-demand dashboard with analytics and monthly reports. Gamification behavior remains future work.

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

Financial operations must never fail because gamification failed. Transaction events from Part 3 call a guarded placeholder only after commit; Part 5 adds no gamification events or behavior.

Every authenticated endpoint uses `requireAuth`; transaction and audit repository operations also scope reads and writes by the authenticated user ID. Add this guard to every future protected route.

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

## Transactions, categories, and budgets

Transaction endpoints (all require the auth cookie):

| Method   | Endpoint                               | Behavior                                                                     |
| -------- | -------------------------------------- | ---------------------------------------------------------------------------- |
| `GET`    | `/api/categories?type=income\|expense` | List system defaults and the signed-in user's custom categories              |
| `POST`   | `/api/categories`                      | Add a custom category                                                        |
| `PATCH`  | `/api/categories/:id`                  | Rename or change the icon of a custom category                               |
| `DELETE` | `/api/categories/:id`                  | Archive a custom category; active transactions prevent deletion              |
| `POST`   | `/api/transactions`                    | Create an income or expense transaction                                      |
| `GET`    | `/api/transactions`                    | List with filters, sorting, pagination, and optional deleted rows            |
| `GET`    | `/api/transactions/:id`                | Read one owned transaction (`?includeDeleted=true` includes deleted records) |
| `PATCH`  | `/api/transactions/:id`                | Update an active owned transaction                                           |
| `DELETE` | `/api/transactions/:id`                | Soft-delete an owned transaction                                             |
| `POST`   | `/api/transactions/:id/restore`        | Restore an owned soft-deleted transaction                                    |
| `GET`    | `/api/transactions/:id/history`        | Read the owner's append-only audit history                                   |

The API accepts a rupee `amount` as a decimal string or number and consistently returns both `amountPaise` (integer) and `amount` (a two-decimal string). SQLite stores only integer paise. Filters `minAmount` and `maxAmount` also use rupees. All transaction changes and their audit rows commit in one SQLite transaction. Audit rows include before/after snapshots and are append-only; repository access only exposes insertion and owner-scoped reads, with SQLite triggers rejecting direct updates or deletes.

Deleting a transaction sets `deleted_at`; list results exclude deleted rows unless `includeDeleted=true`. Deleting a transaction twice returns `404 TRANSACTION_NOT_FOUND`. Restore writes a history entry. Updating an unchanged transaction is a no-op: no timestamp, audit row, or event changes.

Custom categories are archived through `deleted_at` rather than hard-deleted because transaction foreign keys and historical snapshots must remain valid. A same-name/type category added later revives the archived row. Restoring a transaction also revives its archived custom category if needed. This is the reason migration `002_transaction_audit.sql` adds `categories.deleted_at` in addition to the audit table.

Create, update, and delete events are sent to the Part 1 gamification placeholder only after the database transaction commits. Event errors are caught and logged so financial writes remain successful. No XP or streak rules are implemented here; restore and no-op updates emit no event.

All state-changing category, transaction, and budget endpoints require `Content-Type: application/json`, using the same SameSite=Lax CSRF mitigation documented above for authentication.

Budget endpoints (authenticated):

| Method   | Endpoint                                    | Behavior                                                         |
| -------- | ------------------------------------------- | ---------------------------------------------------------------- |
| `PUT`    | `/api/budgets`                              | Set or update a monthly total, category-monthly, or daily limit  |
| `GET`    | `/api/budgets?month=YYYY-MM&scope=...`      | List the user's configured budget rows                           |
| `DELETE` | `/api/budgets/:id`                          | Delete an owned row and append a history entry                   |
| `GET`    | `/api/budgets/status?month=YYYY-MM`         | Calculate monthly, category, and unbudgeted spending             |
| `GET`    | `/api/budgets/daily-status?date=YYYY-MM-DD` | Calculate that date's expenses against the effective daily limit |

Budget rows store only configured limits in integer paise. Budget row endpoints accept rupees as a decimal string or number and return both `amountPaise` and a two-decimal `amount` string. Computed status responses return paise plus INR-formatted strings. Spend is always calculated from non-deleted `expense` transactions and their `transaction_date`; income and `created_at` do not affect spending totals. The pure, framework-free `server/src/services/budgetCalculator.js` owns status percentages, thresholds, calendar-day progress, and daily pacing. Warning starts at 80% (configured in `server/src/config/budgetConfig.js`); equality with the limit is `warning`, and spending above it is `exceeded`. A zero limit with zero spend is `on_track`; with positive spend it is `exceeded` and percent is null to avoid division by zero.

The budget resolution rule lives in `budgetService.js`: for a month and scope (plus category, if relevant), use the month-specific row first, then the NULL-month default, otherwise no budget. Deleting an override makes the default effective again. Status percentages are rounded to one decimal using integer paise arithmetic. `daysElapsed` counts completed days; `daysRemaining` includes today. For the current month, `safeDailySpendPaise` is `floor(max(0, monthly budget - spent) / days remaining including today)` and is zero when over budget, no budget exists, or no days remain.

`budget_history` is append-only and records set, update, and delete operations. Scope, category, and month are copied into each entry so the audit remains interpretable after a budget row is removed. A delete entry has a null `budget_id`; earlier entries retain it as a historical identifier without a foreign key, avoiding any update to immutable history. SQLite triggers reject direct history updates and deletes.

Part 3 transaction API mutations dispatch a budget invalidation signal; the budget page refreshes status and daily-status after create, update, delete, or restore. Dashboard and analytics data use TanStack Query. Transaction create, update, delete, and restore plus budget set, update, and delete invalidate the dashboard and analytics cache keys.

## Dashboard and analytics

The dashboard and analytics endpoints require authentication:

| Method | Endpoint                                            | Behavior                                                                                                                                     |
| ------ | --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET`  | `/api/dashboard/summary?month=YYYY-MM`              | Summary cards, selected-month totals, previous-month comparison, current-day status, recent transactions, top categories, and budget summary |
| `GET`  | `/api/analytics/category-breakdown?from=&to=&type=` | Category totals and largest-remainder basis-point shares; date range is capped at 366 days                                                   |
| `GET`  | `/api/analytics/daily-spending?from=&to=`           | Calendar-day totals with zero-filled days and each day's resolved daily limit; range capped at 93 days                                       |
| `GET`  | `/api/analytics/income-vs-expense?months=6`         | Zero-filled monthly income, expense, and net totals; maximum 12 months                                                                       |
| `GET`  | `/api/analytics/monthly-report?month=YYYY-MM`       | JSON report with totals, changed categories, top expense entries, notable days, budgets, and tracking consistency                            |

Analytics are derived on demand from non-deleted transactions. SQL performs the sums, counts, and grouping, using `transaction_date` for month, day, and comparison buckets. Dashboard totals reconcile with category breakdowns, daily totals, and monthly report totals for the same dates. The selected dashboard month never changes the Today card. There is no cached or stored aggregate state.

`server/src/services/analyticsCalculator.js` contains framework-free rounding, comparisons, averages, calendar zero-fill, and day selection. Category shares use the largest-remainder method: each category first receives its integer basis-point floor, then remaining basis points are assigned by descending fractional remainder with a stable category-ID tie break. This guarantees category shares sum to exactly 10,000 basis points (100%). Percentages are derived from integer paise and rounded only at output boundaries.

The dashboard summary executes a fixed 11 SQL queries: one initial timezone lookup and three analytics reads, four monthly budget-status lookups, and three daily-status lookups. It does not issue per-category or per-transaction queries. `GamificationSummarySlot` is an empty client placeholder for later XP, level, and streak summaries; this part adds no gamification behavior.

The standalone benchmark is `npm run perf:analytics`. It seeds 20,000 in-memory transactions and times each dashboard/analytics endpoint; it is separate from the normal test suite. On the local run during implementation: summary 40.0 ms, category breakdown 8.5 ms, daily spending 5.4 ms, income vs expense 9.5 ms, and monthly report 15.5 ms. These are single-run local timings, not service-level targets.

`EXPLAIN QUERY PLAN` showed the daily and category range aggregates using the existing `idx_transactions_user_date (user_id, transaction_date)` index, and the all-time owner aggregate uses `idx_transactions_user_deleted (user_id, deleted_at)`. No analytics index migration was needed. The benchmark script prints these plans for re-checking after schema or query changes.

## Run locally

1. Install Node.js 22.12 or newer and npm, then run `npm install` from the repository root.
2. Copy `.env.example` to `.env` and set values for your environment. Replace `JWT_SECRET` with a long random secret (at least 32 characters in production).
3. Run `npm run db:migrate` and `npm run db:seed`.
4. Run `npm run dev` and open <http://localhost:5173>. The landing page reports the API/database health status.

Useful commands: `npm test`, `npm run lint`, `npm run format`, `npm run db:migrate`, `npm run db:seed`, and `npm run db:reset` (development only).

The Vite development server proxies `/api` to `http://localhost:3001`. Configure the proxy through `VITE_API_PROXY_TARGET` if needed. The client can use `VITE_API_BASE_URL` when calling a separately hosted API.
