CREATE TABLE streak_runs (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  streak_type TEXT NOT NULL CHECK(streak_type IN ('TRACKING_DAILY','BUDGET_DAILY','CONSISTENCY_WEEKLY','BUDGET_MONTHLY')),
  started_key TEXT NOT NULL,
  ended_key TEXT,
  end_reason TEXT CHECK(end_reason IS NULL OR end_reason='MISSED'),
  counted_days INTEGER NOT NULL DEFAULT 0,
  length_offset INTEGER NOT NULL DEFAULT 0,
  length_at_end INTEGER,
  restored_from_run_id INTEGER REFERENCES streak_runs(id),
  restored_at_key TEXT,
  genuine_days_since_restore INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_streak_runs_user_type ON streak_runs(user_id,streak_type,started_key);

CREATE TABLE streak_state (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  streak_type TEXT NOT NULL CHECK(streak_type IN ('TRACKING_DAILY','BUDGET_DAILY','CONSISTENCY_WEEKLY','BUDGET_MONTHLY')),
  status TEXT NOT NULL CHECK(status IN ('NONE','ACTIVE','BROKEN')),
  current_run_id INTEGER REFERENCES streak_runs(id),
  current_length INTEGER NOT NULL DEFAULT 0,
  longest_length INTEGER NOT NULL DEFAULT 0,
  last_processed_key TEXT,
  last_counted_key TEXT,
  consecutive_frozen INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(user_id,streak_type)
);

CREATE TABLE streak_periods (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  streak_type TEXT NOT NULL,
  period_key TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('COUNTED','FROZEN','EXEMPT','MISSED')),
  run_id INTEGER REFERENCES streak_runs(id),
  reason_code TEXT NOT NULL,
  processed_at TEXT NOT NULL,
  PRIMARY KEY(user_id,streak_type,period_key)
);
CREATE INDEX idx_streak_periods_user_key ON streak_periods(user_id,streak_type,period_key);

CREATE TABLE streak_milestones (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  streak_type TEXT NOT NULL,
  milestone INTEGER NOT NULL,
  reached_key TEXT NOT NULL,
  run_id INTEGER REFERENCES streak_runs(id),
  created_at TEXT NOT NULL,
  UNIQUE(user_id,streak_type,milestone)
);
CREATE TRIGGER streak_milestones_no_update BEFORE UPDATE ON streak_milestones BEGIN SELECT RAISE(ABORT,'streak milestones are append-only'); END;
CREATE TRIGGER streak_milestones_no_delete BEFORE DELETE ON streak_milestones BEGIN SELECT RAISE(ABORT,'streak milestones are append-only'); END;

CREATE TABLE freeze_ledger (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  delta INTEGER NOT NULL CHECK(delta IN (-1,1)),
  reason TEXT NOT NULL CHECK(reason IN ('STARTER','REGEN','PURCHASE','ADMIN','USED','RECOMPUTE_ADJUST')),
  effective_at TEXT NOT NULL,
  effective_local_date TEXT NOT NULL,
  period_key TEXT,
  idempotency_key TEXT NOT NULL UNIQUE,
  actor TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_freeze_ledger_user_effective ON freeze_ledger(user_id,effective_at,id);
CREATE TRIGGER freeze_ledger_no_update BEFORE UPDATE ON freeze_ledger BEGIN SELECT RAISE(ABORT,'freeze ledger is append-only'); END;
CREATE TRIGGER freeze_ledger_no_delete BEFORE DELETE ON freeze_ledger BEGIN SELECT RAISE(ABORT,'freeze ledger is append-only'); END;

CREATE TABLE timezone_changes (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  changed_at TEXT NOT NULL,
  old_tz TEXT NOT NULL,
  new_tz TEXT NOT NULL,
  old_local_date TEXT NOT NULL,
  new_local_date TEXT NOT NULL,
  skipped_dates_json TEXT NOT NULL
);
CREATE INDEX idx_timezone_changes_user_date ON timezone_changes(user_id,changed_at);
CREATE TRIGGER timezone_changes_no_update BEFORE UPDATE ON timezone_changes BEGIN SELECT RAISE(ABORT,'timezone history is append-only'); END;
CREATE TRIGGER timezone_changes_no_delete BEFORE DELETE ON timezone_changes BEGIN SELECT RAISE(ABORT,'timezone history is append-only'); END;
