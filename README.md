# CoinXP — Project Progress Tracker (Temporary)

> Temporary glanceable tracker mapped from the supplied product vision and Phase 1 plan. Check a box when its **Done when** condition is met; add brief evidence or a link in the Notes column. All items start unchecked because no implementation status was provided.

## Roadmap at a glance

| Phase | Focus | Target outcome | Progress |
|---|---|---|---|
| [ ] **Phase 1** | Core product + gamification (Parts 1–10 below) | Functional web app: accurate financial tracking, budgets, progression, and rewards | 0 / 10 parts |
| [ ] **Phase 2** | Commercialization + social features | Production-ready financial platform | Not started |
| [ ] **Phase 3** | Cloud infrastructure + mobile | Cross-platform ecosystem using a shared backend | Not started |

**Phase 1 sequence:** Parts 1–5 build the finance app; Parts 6–9 add the CoinXP progression system; Part 10 polishes, hardens, and deploys. Animation work may overlap Parts 6–9.

## Phase 1 — Core CoinXP

| Done | Part | Goal / scope | Done when | Notes |
|---|---|---|---|---|
| [ ] | **1. Foundation and architecture** | Client/server monorepo; TypeScript client, Express server, gamification module; env, lint/format, SQLite migrations; schema for users, categories, transactions, budgets. Money in integer paise; ISO dates; separate `transaction_date` and `created_at`. | Client calls server `/health`, and migrations run from scratch. | |
| [ ] | **2. Authentication** | Registration/login/logout; password hashing; JWT and protected routes; validation, login rate limit; auth context and pages. | User can register, log in, access a protected route, and is rejected without a token. | |
| [ ] | **3. Transaction engine** | Income/expense CRUD; categories, descriptions, dates; edit audit trail; soft deletes; filterable, paginated history. | Edits/deletes retain audit history, and money calculations pass unit tests without floating-point errors. | |
| [ ] | **4. Budget management** | Monthly, category, and daily limits; spent/remaining/percent-used calculations; settings page and over-budget status. | Budget status for a day, week, or month is correctly computed from transactions. | |
| [ ] | **5. Dashboard and analytics** | Balance, income, expenses, remaining budget, daily spend; category and trend charts; recent transactions and monthly report. | Every displayed number reconciles with transaction data. | |
| [ ] | **6. Gamification core: events, XP, levels** | Durable activity events; XP ledger; configurable levels/rules; discipline-focused XP; idempotency; gamification runs after financial commit. | Transaction event awards the correct XP once, and level-up is detected. | |
| [ ] | **7. Streaks and streak freeze** | Current-day activity only; local-day boundaries; freeze inventory, auto-use and consecutive-use cap; rollover handling. Backdated transactions do not count. | Tests cover day boundaries, backdating, freezes, and multi-day gaps. | |
| [ ] | **8. Spending thresholds, penalties, anti-abuse** | Detect edits that push daily spend over limit; ledger deduction, warning and event; distinguish overspending from corrections; prevent duplicate penalties and support reversal on revert. | ₹400 → ₹750 behaves as specified; repeated edits do not stack penalties. | |
| [ ] | **9. Achievements, rewards, challenges** | Achievement evaluators and unlock history; lean shop (freezes, cosmetics, challenge unlocks); ledger-based redemption; 7-Day Discipline Challenge; profile and activity history. | User can earn XP, redeem a freeze, unlock a badge, and complete a challenge, with each visible in history. | |
| [ ] | **10. Animation, polish, testing, deployment** | State-based motion; responsive loading/empty/error states; end-to-end critical-flow coverage; security pass; seed/demo data; README and first deployment. | New user completes register → track → earn XP → level up → redeem without broken states. | |

**Phase 1 progress:** 0 / 10 parts complete

## Phase 2 — Commercialization and social features

- [ ] Define commercialization and production-readiness scope.
- [ ] Plan social accountability features.
- [ ] Deliver the production-ready financial platform.

## Phase 3 — Cloud and mobile ecosystem

- [ ] Move toward cloud infrastructure and a managed database (PostgreSQL in the proposed direction).
- [ ] Build a mobile client (React Native + Expo in the proposed direction).
- [ ] Reuse the same API and financial/gamification logic across web and mobile.
- [ ] Add production storage, monitoring, and deployment infrastructure.

## Product and engineering principles

- Financial correctness comes before gamification; gamification failure must not lose a transaction.
- Keep XP, level formulas, thresholds, and streak rules in one `rules.config` file; do not hardcode tunable values.
- Make gamification deterministic, idempotent, and auditable.
- Store money as integer paise; keep transaction date distinct from creation time.
- Design for expansion, but implement only the current phase's scope.
- Reward healthier financial habits, not transaction volume or simply spending less.

## Current status

No implementation progress was supplied with the planning notes, so all parts are initially unchecked. Update the checkboxes and Notes as work is completed.
