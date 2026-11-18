# CoinXP architecture map

CoinXP is an npm-workspaces monorepo: `client/` is React/TypeScript/Vite and `server/` is Express ES modules with SQLite. Financial values persist as integer paise; dates that describe money movement are separate from record timestamps.

```text
Browser (React Router, TanStack Query)
  └─ typed API services ─ REST/JSON ─ Express middleware
       └─ routes → controllers → services → repositories → SQLite
```

Routes authenticate and validate; controllers translate HTTP; services own business decisions and transaction boundaries; repositories contain SQL. Gamification settlement runs in the isolated engine and uses its outbox/ledger rules. Presentation-only visuals live in `client/src/visuals/` and are described by pure functions and `visuals.config.ts`.

| Part | Project area |
| --- | --- |
| 1 | Workspaces, base client/server, SQLite migrations, money/date utilities |
| 2 | Cookie authentication and guarded routes |
| 3 | Categories, transactions, audit history and soft delete |
| 4 | Derived budgets and pure calculator |
| 5 | Dashboard and analytics aggregation |
| 6 | XP engine and ledger |
| 7 | Streak settlement and freeze ledger |
| 8 | Integrity flags, notices, holds and review operations |
| 9 | Badges, missions, shop, challenges, profile and activity |
| 10 | Dynamic visuals, settings, celebration presentation, production hardening and deployment groundwork |

Part 10 is still in progress. See [README.md](README.md), [SECURITY.md](SECURITY.md), [DEPLOY.md](DEPLOY.md), and [RUNBOOK.md](RUNBOOK.md) for current state and open release work. The owner-provided Part 6–10 specifications remain the detailed rule references and should be retained with the project documentation when available.
