ALTER TABLE transactions ADD COLUMN created_local_date TEXT;
ALTER TABLE transactions ADD COLUMN created_tz TEXT;
ALTER TABLE users ADD COLUMN timezone_changed_at TEXT;

CREATE INDEX idx_transaction_audit_transaction_created
  ON transaction_audit(transaction_id, created_at);

CREATE TABLE domain_events (
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  event_id TEXT NOT NULL UNIQUE,
  event_type TEXT NOT NULL,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  payload_json TEXT NOT NULL,
  local_date TEXT,
  timezone TEXT,
  schema_version INTEGER NOT NULL,
  occurred_at TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('PENDING','PROCESSED','FAILED','DEAD','SKIPPED','PUBLISHED')),
  attempts INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT,
  last_error TEXT,
  processed_at TEXT,
  dedupe_key TEXT UNIQUE
);
CREATE INDEX idx_domain_events_status_next ON domain_events(status, next_attempt_at);
CREATE INDEX idx_domain_events_user_seq ON domain_events(user_id, seq);

CREATE TABLE xp_ledger (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entry_type TEXT NOT NULL CHECK(entry_type IN ('AWARD','REVERSAL','REINSTATE','ADJUSTMENT','SPEND')),
  rule_id TEXT,
  entitlement_key TEXT,
  transition_no INTEGER,
  idempotency_key TEXT NOT NULL UNIQUE,
  lifetime_delta INTEGER NOT NULL,
  balance_delta INTEGER NOT NULL,
  period_type TEXT NOT NULL CHECK(period_type IN ('day','week','month','once','admin')),
  period_key TEXT NOT NULL,
  reverses_entry_id INTEGER REFERENCES xp_ledger(id),
  source_event_id TEXT,
  reason_code TEXT NOT NULL,
  note TEXT,
  config_version TEXT NOT NULL,
  actor TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_xp_ledger_user_id ON xp_ledger(user_id, id);
CREATE INDEX idx_xp_ledger_user_entitlement_transition ON xp_ledger(user_id, entitlement_key, transition_no);
CREATE TRIGGER xp_ledger_no_update BEFORE UPDATE ON xp_ledger BEGIN SELECT RAISE(ABORT, 'xp_ledger is append-only'); END;
CREATE TRIGGER xp_ledger_no_delete BEFORE DELETE ON xp_ledger BEGIN SELECT RAISE(ABORT, 'xp_ledger is append-only'); END;

CREATE TABLE user_progress (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  lifetime_xp INTEGER NOT NULL CHECK(lifetime_xp >= 0),
  spendable_xp INTEGER NOT NULL,
  max_level_reached INTEGER NOT NULL DEFAULT 1,
  gamification_start_date TEXT,
  last_ledger_id INTEGER,
  last_seen_ledger_id INTEGER NOT NULL DEFAULT 0,
  last_settled_date TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE daily_reviews (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  local_date TEXT NOT NULL,
  completed_at TEXT NOT NULL,
  no_spend_declared INTEGER NOT NULL CHECK(no_spend_declared IN (0,1)),
  xp_eligible INTEGER NOT NULL CHECK(xp_eligible IN (0,1)),
  summary_json TEXT NOT NULL,
  UNIQUE(user_id, local_date)
);
CREATE INDEX idx_daily_reviews_user_date ON daily_reviews(user_id, local_date);

CREATE TABLE settlements (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  period_type TEXT NOT NULL CHECK(period_type IN ('day','week','month')),
  period_key TEXT NOT NULL,
  outcome TEXT NOT NULL CHECK(outcome IN ('PASS','FAIL','INELIGIBLE')),
  reason_code TEXT NOT NULL,
  details_json TEXT NOT NULL,
  settled_at TEXT NOT NULL,
  rule_version TEXT NOT NULL,
  UNIQUE(user_id, period_type, period_key)
);
CREATE INDEX idx_settlements_user_period ON settlements(user_id, period_type, period_key);

CREATE TABLE gamification_flags (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  local_date TEXT NOT NULL,
  details_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'OPEN',
  UNIQUE(user_id, code, local_date)
);

CREATE TABLE request_idempotency (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  idempotency_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  response_status INTEGER NOT NULL,
  response_body TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(user_id, idempotency_key)
);
CREATE INDEX idx_request_idempotency_created ON request_idempotency(created_at);
