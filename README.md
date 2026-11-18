# CoinXP

CoinXP is a personal finance web app designed to grow into a habit-building product. It includes the project foundation, cookie-based authentication, transaction and category management, budgets, an on-demand dashboard with analytics and monthly reports, a reversible XP economy, and the first streak engine with freezes and comeback recovery.

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
│   ├── gamification/ # XP engine, pure streak transitions, settlement integration
│   ├── db/           # connection, migrations, migration runner
│   ├── utils/
│   ├── app.js        # testable Express app; does not listen
│   └── server.js     # process entry point; starts listening
└── README.md
```

## Layering rules

Request flow is **routes → controllers → services → repositories → db**. Controllers do not execute SQL. Repositories are the only layer where SQL belongs. `app.js` builds the Express app without opening a listener so it can be exercised with Supertest.

Financial operations must never fail because gamification failed. Financial events are committed with the financial write and consumed after commit. Streak state advances from immutable Part 6 settlements and writes only gamification tables, its freeze ledger, output events, and milestone XP.

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

Create, update, delete, and restore operations enqueue durable domain events in the same database transaction as their financial row and audit snapshot. The Part 6 worker processes events after commit; failures are retried and cannot change the financial response. Restore emits an event; a no-op update does not.

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

The dashboard summary executes a fixed 11 SQL queries: one initial timezone lookup and three analytics reads, four monthly budget-status lookups, and three daily-status lookups. It does not issue per-category or per-transaction queries. The dashboard includes the live XP and streak summary cards introduced in Parts 6 and 7; badges, challenges, rewards, and penalties remain reserved for later parts.

The standalone benchmark is `npm run perf:analytics`. It seeds 20,000 in-memory transactions and times each dashboard/analytics endpoint; it is separate from the normal test suite. On the local run during implementation: summary 40.0 ms, category breakdown 8.5 ms, daily spending 5.4 ms, income vs expense 9.5 ms, and monthly report 15.5 ms. These are single-run local timings, not service-level targets.

`EXPLAIN QUERY PLAN` showed the daily and category range aggregates using the existing `idx_transactions_user_date (user_id, transaction_date)` index, and the all-time owner aggregate uses `idx_transactions_user_deleted (user_id, deleted_at)`. No analytics index migration was needed. The benchmark script prints these plans for re-checking after schema or query changes.

## Run locally

1. Install Node.js 22.12 or newer and npm, then run `npm install` from the repository root.
2. Copy `.env.example` to `.env` and set values for your environment. Replace `JWT_SECRET` with a long random secret (at least 32 characters in production).
3. Run `npm run db:migrate` and `npm run db:seed`.
4. Run `npm run dev` and open <http://localhost:5173>. The landing page reports the API/database health status.

Useful commands: `npm test`, `npm run lint`, `npm run format`, `npm run db:migrate`, `npm run db:seed`, and `npm run db:reset` (development only).

The Vite development server proxies `/api` to `http://localhost:3001`. Configure the proxy through `VITE_API_PROXY_TARGET` if needed. The client can use `VITE_API_BASE_URL` when calling a separately hosted API.

## XP economy and gamification

Part 6 adds an XP ledger and durable event pipeline. All rule values, thresholds, titles, caps, retry settings, timezone cooldown, and settlement windows live in `server/src/gamification/rules.config.js` (config version `0.1.0`). The attached Part 6 plan labels its settings as proposed; this implementation uses those recommended defaults. Change the defaults there only, then increment `CONFIG_VERSION` when deployed rules change.

The economy keeps **lifetime XP** (used to derive the level) separate from **spendable XP** (reserved for future rewards). Both balances are cached in `user_progress` and can be rebuilt from the append-only `xp_ledger`. Ledger updates and deletes are blocked by SQLite triggers. An earned entitlement is unique by user and period; when its source stops qualifying, the ledger appends a reversal, and restoring eligibility appends a reinstatement. Each transition has a deterministic idempotency key. Level thresholds follow `base × L × (L − 1)` with base 50 and a level cap of 100; the maximum level reached is ratcheted.

Current default awards:

| Rule | Default |
| ---- | ------- |
| XP-001 daily transaction tracking | +10 for a non-deleted transaction of at least 500 paise entered on the same local date it happened |
| XP-002 daily review | +15 once for a current-date review with a qualifying live transaction, or a valid no-spend declaration |
| XP-003 daily limit adherence | +20 after the local next-day 04:00 settlement, using the daily limit snapshot from local day start |
| XP-004 weekly consistency | +50 when at least `ceil(5 × eligible days / 7)` eligible days are tracked; at least three eligible days are required |
| XP-005 monthly budget completion | +100 when at least 60% of eligible days are tracked (minimum 14) and spending stays within the month-start budget snapshot |
| XP-006 onboarding milestones | +25 for first live transaction, first budget, and first daily review |
| Combined daily cap | 100 XP across XP-001, XP-002, and XP-003 |

No-spend declarations are XP-eligible at most twice per local Monday-to-Sunday week; further declarations are still recorded but not XP-eligible. A no-spend review requires no expense transaction on that local date. Daily reviews are permanent records. Transaction edits/deletes can reverse tracking, eligible review XP, and settlement entitlements, but they do not erase the review record. If a transaction is restored within the configured settlement window, an entitlement can be reinstated. Periods become immutable after 90 days; a nightly reconciliation checks the most recent 45 days.

Daily and monthly settlement snapshots reconstruct transactions from `transaction_audit` and budgets from `budget_history`, both at the relevant local cutoff. Daily limits are snapshotted at the beginning of each local date; the monthly total is snapshotted at the beginning of the month. The first settlement boundary is local next day at 04:00. A scheduler runs settlement and outbox work, retries failed events with backoff, moves repeated failures to a dead-letter state, and purges completed outbox and idempotency rows after retention. The health endpoint reports the current dead-event count.

Financial writes enqueue domain events inside the same database transaction as the financial row and audit/history entry. The worker processes them after commit. Gamification processing failures are logged and retried and cannot roll back transaction, budget, registration, or timezone writes. Set `GAMIFICATION_ENABLED=false` to disable event ingestion and awards while keeping financial operations available. `POST /api/transactions` accepts an optional `Idempotency-Key`; the client supplies one on each create request so a retried HTTP request cannot create a duplicate transaction.

Authenticated endpoints:

| Method | Endpoint | Behavior |
| ------ | -------- | -------- |
| `GET` | `/api/gamification/summary` | Lifetime/spendable XP, level progress, today’s review and tracking state, and unseen feed entries |
| `GET` | `/api/gamification/ledger?page=&pageSize=&ruleId=&from=&to=` | Owner-scoped, paginated immutable XP ledger |
| `GET` | `/api/gamification/daily-review/today` | Current local-date review eligibility and blockers |
| `POST` | `/api/gamification/daily-review` | Record today’s review; optional `{ "noSpend": true }` declaration |
| `POST` | `/api/gamification/feed/ack` | Acknowledge the owner’s ledger feed through `{ "upToLedgerId": n }` |
| `PATCH` | `/api/auth/timezone` | Change the IANA timezone; first change is free, later changes follow the configured cooldown |
| `GET` | `/api/gamification/rules` | Public, versioned rules configuration |

The dashboard XP card offers the daily review. `/xp` shows level progress and ledger history. The UI displays XP change toasts from successful events. Timezone changes update future local-day calculations; transaction creation also records `created_local_date` and `created_tz` so XP-001 eligibility does not drift when a user later changes timezone. Existing rows receive NULL creation-date metadata from migration `004`; they remain part of financial totals but do not qualify for XP-001.

Anti-abuse indicators are stored in `gamification_flags`: rapid entitlement churn, bulk backfill, four or more timezone changes within 30 days, and monthly budgets raised after a failed month are review flags only. Timezone changes are also limited by the configured seven-day cooldown after the first change. No XP penalty is applied. Part 6 itself does not implement streak, freeze, badge, reward, challenge, or social behavior.

## Part 7: Streak engine

The streak engine consumes the Part 6 day settlement's `details.xpTracked` value as its only definition of a tracking day. `tracked` and `xpTracked` are both included in settlement details and the `DAY_SETTLED` event; a capped no-spend declaration can remain declared for the calendar but does not extend a streak. The timezone-change history records old/new zones and local dates in the same database transaction as the timezone update. Only local date labels strictly between the old and new local dates are exempt; historical streak periods are never rewritten by a timezone change or later transaction edit.

The pure transition functions live in `server/src/gamification/streaks/streakEngine.js`. The orchestrator settles Part 6 first, then processes closed dates in ascending order. Each date is committed independently with its period, run/state update, freeze ledger changes, published output events, and any milestone XP entitlement. Unique keys plus `BEGIN IMMEDIATE` make concurrent reads and scheduler catch-up idempotent. `STREAK_MILESTONE_REACHED` awards use a `once` XP entitlement, so they are outside the Part 6 daily XP cap and cannot be farmed by restarting a streak.

Recommended proposed defaults from the Part 7 spec are in `server/src/gamification/rules.config.js`: one starter freeze at three counted days, one more every 14 counted days, two held and two consecutive freeze uses maximum; comeback after three consecutive counted days within a three-label gap, restoring 50% of a prior run of at least 10 days, with 14 genuine counted days required before another comeback. Milestone XP is one-time per milestone per account. Secondary daily-budget, weekly-consistency, and monthly-budget chains are display-only and do not award XP. Anti-abuse signals (`NOSPEND_PATTERN`, `TZ_EXEMPT_REPEAT`, `FREEZE_USED_RAPID`) are informational flags only.

Authenticated endpoints:

| Method | Endpoint | Behavior |
| ------ | -------- | -------- |
| `GET` | `/api/streaks` | Settle/advance and return tracking status, secondary chains, freeze inventory, at-risk state, next milestone, and recent streak events |
| `GET` | `/api/streaks/tracking/calendar?from=&to=` | Zero-filled daily statuses and secondary chain statuses; maximum 366 dates |
| `GET` | `/api/streaks/freezes?page=&pageSize=` | Owner-scoped freeze balance and append-only ledger history |
| `GET` | `/api/streaks/rules` | Streak configuration for the signed-in client |

Migration `005_streaks.sql` adds runs, state, periods, milestones, the append-only freeze ledger, and timezone-change history. Migration `006_streak_comeback_state.sql` persists comeback progress and the rule version for each run/period. Dashboard transactions, budgets, daily-review, and timezone mutations invalidate the streak query cache. `/streaks` includes the month calendar, milestones, secondary streaks, and freeze history. Streak events are stored as `PUBLISHED` Part 6 outbox rows with per-event dedupe keys and are presented once per browser session.

Local operations (all administrative commands are dry-run unless `--apply` is provided):

```sh
npm run gamification:adjust -- 12 25 "correction reason" --actor reviewer --apply
npm run gamification:reconcile -- 12 2026-10-01 2026-11-10 --apply
npm run gamification:rebuild-cache -- 12 --apply
npm run gamification:requeue-dead -- 12 --apply
```

`GET /api/health` adds `gamificationDeadEvents`. Review these counts and the stored flags during operations; individual flag details and internal retry errors are not exposed through public API routes.

## Part 8: thresholds and reward integrity (implementation in progress)

The Part 8 migration is `007_integrity_foundation.sql`. It adds in-app notices, cases and append-only case actions, reward holds, entitlement locks, audit-run storage, and the unexpected-expense fields. Policy numbers are grouped under `integrity` in `server/src/gamification/rules.config.js`; the public gamification-rules endpoint intentionally omits that section so detector thresholds are not disclosed. `npm run integrity -- audit [--user <id>]` runs consistency and theoretical XP ceiling checks in dry-run mode; add `--apply` to persist the audit run and raise an ops flag on ceiling violations. The periodic scheduler persists audits every configured 24 hours. Auditing is observational and does not repair XP or financial data. The ceiling calculation uses the current configured XP rules; this phase does not archive historical rule-config snapshots, so older seasons need a version-aware ceiling calculation later.

## Part 9: badges, missions and rewards (implementation in progress)

Migration `008_rewards_foundation.sql` adds storage for badges, missions, challenges, purchases, cosmetics, private profiles, preferences and activity items. Badge backfills are available through `npm run rewards -- badges backfill [--slug <slug>] [--user <id>] [--apply]`; dry-run is the default and previews eligible visible badge families. Backfill behavior uses `rewards.backfill.awardXp` and emits one coalesced summary notice when `silent` is enabled. Case-linked badge revocation uses `npm run rewards -- badges revoke --user <id> --slug <slug> --tier <n> --case <id> --actor <name> --note "review reason of at least 10 characters" [--apply]`; it is dry-run by default, reverses the BAD-003 ledger entitlement, writes a case action and locks the tier against re-unlock. It extends notices and reward holds for the Part 9 kinds and `PROGRESSION_XP` scope, and enforces that `SPEND` ledger entries have zero lifetime delta and a non-zero balance delta. Reward catalogs are versioned and validated by `gamification/rewards/catalog.js`; the metric whitelist excludes financial amounts. The economy report computes XP from config and checks the configured recurring and one-time bounds. The current spec lists 11 mission templates in Section 5 despite describing 14 templates in DD-36; the implementation uses the 11 specified templates.

Implemented so far: `GET /api/badges` returns the authenticated user's visible badge families, tiers and progress; locked hidden families are represented only by `hiddenRemaining`. Badge unlocks are latched, recorded in `user_badges`, awarded through the XP ledger, and progression XP is deferred during `PROGRESSION_XP` holds. The private `/badges` page displays tiers and progress. `GET /api/missions` deterministically assigns current daily, weekly and monthly missions from the configured catalog after the minimum account age; `GET /api/missions/history?page=&pageSize=` returns private paged assignment outcomes. `POST /api/missions/:slot/reroll` replaces an eligible current daily or weekly assignment once per configured allowance. At period close, missions are checked against snapshots at the user's local cutoff and either completed with MIS-004 XP or expired; counted-outcome conditions defer during active outcome holds. The `/missions` page shows assignments, and transaction/budget mutations invalidate badge and mission caches. `GET /api/shop`, `GET /api/shop/purchases`, and idempotent `POST /api/shop/purchase` support cosmetic and streak-freeze purchases; SPEND changes only spendable XP, and freeze inventory failure rolls back the purchase. Challenge routes support authenticated catalog, start, cancel/refund, abandon, and run/day views; day results are evaluated at local close and first-completion XP is ledger-backed. The `/challenges` page supports starting and managing a challenge. `GET /api/profile` returns a private progress profile without transaction or purchase details; owned active badges can be saved as a three-item showcase and owned cosmetics can be equipped by slot. `/profile` exposes those controls and a limited progress activity summary. Profile activity is allowlisted to badge, mission, challenge, streak and level events. `GET /api/activity` provides private cursor-paged activity; `GET/PUT /api/notifications/preferences` returns per-category settings and allows changes only to configured mutable categories. Locked `RESTRICTION`, `REVIEW` and `XP_CHANGE` notifications remain enabled. The Activity page exposes the timeline and the update center includes preference controls; notice history itself remains readable when a category is muted.

An expense marked unexpected consumes one marker in the user's local month, and that marker is never refunded. At the daily settlement, flagged unexpected expenses are subtracted only for XP-003 daily-limit adherence. They remain in budgets, analytics, balances, and XP-005 monthly budget evaluation. The transaction API provides `GET /api/transactions/unexpected-quota`; create and patch accept `isUnexpected` and an optional configured `unexpectedReason`.

When `integrity.correction.amnestyHours` is greater than zero, a spend increase inside the window after settlement is excluded from the evaluated spend up to the window edge. The default is zero hours, preserving the existing immediate-reversal policy. Reversals and reinstatements use the existing XP ledger transitions; a held reward only defers positive XP-003/004/005 transitions and STR-006 milestone XP. Financial operations remain available during a hold. Automatic signals are deduplicated, score-capped per code, and require distinct eligible signal codes plus account-age and rolling-hold gates before starting a hold.

Authenticated Part 8 endpoints currently available:

| Method | Endpoint | Behavior |
| ------ | -------- | -------- |
| `GET` | `/api/integrity/status` | Active reward hold, appeal availability, unread count, and last notice code |
| `GET` | `/api/integrity/notices?page=&pageSize=&unreadOnly=&kind=` | Owner-scoped notices with copy resolved from `gamification/messages.js` |
| `POST` | `/api/integrity/notices/ack` | Monotonic acknowledgement through `{ "upToId": n }` |
| `POST` | `/api/integrity/appeals` | Submit one message (up to 500 characters) for an eligible hold/case |
| `GET` | `/api/transactions/unexpected-quota` | Local-month allowance usage |

CLI-only integrity operations (all changes are dry-run unless `--apply` is present):

```sh
npm run integrity -- cases list --overdue
npm run integrity -- cases show 12
npm run integrity -- score --user 12
npm run integrity -- cases resolve 12 --action DISMISS --actor reviewer --note "Reviewed evidence and cleared the case." --apply
npm run integrity -- cases resolve 12 --action CLAWBACK --entries 250,251 --actor reviewer --note "Reviewed ledger entries; removing unearned XP." --apply
npm run integrity -- flags dismiss 28 --actor reviewer --note "Duplicate signal reviewed and cleared." --apply
npm run gamification:adjust -- 12 -25 --case 12 --actor reviewer --note "Reviewed adjustment and evidence carefully." --reason-code INTEGRITY_ADJUSTMENT --apply
```

Applied case actions require `--actor` and a note of at least 10 characters; actions are recorded in append-only `case_actions`. The current CLI supports case inspection, scoring, notes, warnings/dismissals, hold extension/release, flag dismissal, and case-linked clawbacks. Clawbacks accept explicit ledger entry ids, remove only active positive awards, cap removal at 500 XP per case, lock the affected entitlement keys, and notify the user. Negative or `INTEGRITY_*` XP adjustments require a case, actor, and note; all applied adjustments notify the user.

The app shell has an on-demand notice center with hold transparency and appeal submission. The transaction form exposes the unexpected-expense marker and monthly quota. Daily, monthly, category, and current-month pace warnings are created as in-app notices and deduplicated by threshold period. Pure warning, detector, correction, and risk-scoring modules live under `server/src/gamification/integrity/`.

This checkpoint does not yet implement the full Part 8 scope: every detector's data-window collector, theoretical XP ceiling checks, retention purge, and all correction-class notices still need follow-up work. The migration and APIs are groundwork; do not treat this section as a claim that all Part 8 acceptance criteria are complete.
