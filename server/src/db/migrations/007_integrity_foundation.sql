ALTER TABLE transactions ADD COLUMN is_unexpected INTEGER NOT NULL DEFAULT 0 CHECK (is_unexpected IN (0, 1));
ALTER TABLE transactions ADD COLUMN unexpected_reason TEXT;
ALTER TABLE transactions ADD COLUMN unexpected_first_flag_month TEXT;

ALTER TABLE gamification_flags ADD COLUMN severity_points INTEGER NOT NULL DEFAULT 0;
ALTER TABLE gamification_flags ADD COLUMN evidence_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE gamification_flags ADD COLUMN detector_version TEXT NOT NULL DEFAULT 'legacy';
ALTER TABLE gamification_flags ADD COLUMN dedupe_key TEXT;
ALTER TABLE gamification_flags ADD COLUMN case_id INTEGER;
CREATE UNIQUE INDEX idx_gamification_flags_dedupe ON gamification_flags(dedupe_key) WHERE dedupe_key IS NOT NULL;

CREATE TABLE user_notices (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN ('INFO','WARNING','XP_CHANGE','RESTRICTION','REVIEW')),
  code TEXT NOT NULL,
  data_json TEXT NOT NULL DEFAULT '{}',
  ledger_entry_id INTEGER REFERENCES xp_ledger(id),
  dedupe_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  read_at TEXT
);
CREATE INDEX idx_user_notices_user_created ON user_notices(user_id, created_at DESC, id DESC);
CREATE INDEX idx_user_notices_unread ON user_notices(user_id, read_at, id);

CREATE TABLE integrity_cases (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK(status IN ('OPEN','IN_REVIEW','RESOLVED')),
  risk_score INTEGER NOT NULL,
  distinct_codes INTEGER NOT NULL,
  opened_at TEXT NOT NULL,
  resolved_at TEXT,
  resolution TEXT CHECK(resolution IN ('DISMISSED','WARNED','HOLD_EXTENDED','CLAWBACK','RESTRICTED')),
  resolved_by TEXT,
  appeal_count INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_integrity_cases_user_status ON integrity_cases(user_id, status, opened_at DESC);

CREATE TABLE case_actions (
  id INTEGER PRIMARY KEY,
  case_id INTEGER NOT NULL REFERENCES integrity_cases(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK(action IN ('OPENED','AUTO_HOLD','NUDGE','APPEAL','DISMISS','WARN','CLAWBACK','EXTEND_HOLD','RELEASE_HOLD','NOTE')),
  actor TEXT NOT NULL,
  note TEXT,
  payload_json TEXT NOT NULL DEFAULT '{}',
  idempotency_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_case_actions_case_created ON case_actions(case_id, created_at, id);
CREATE TRIGGER case_actions_no_update BEFORE UPDATE ON case_actions BEGIN SELECT RAISE(ABORT, 'case_actions is append-only'); END;
CREATE TRIGGER case_actions_no_delete BEFORE DELETE ON case_actions BEGIN SELECT RAISE(ABORT, 'case_actions is append-only'); END;

CREATE TABLE reward_holds (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  case_id INTEGER NOT NULL REFERENCES integrity_cases(id) ON DELETE CASCADE,
  scope TEXT NOT NULL CHECK(scope IN ('OUTCOME_XP','STREAK_XP')),
  status TEXT NOT NULL CHECK(status IN ('ACTIVE','RELEASED','EXPIRED','CONFIRMED')),
  auto INTEGER NOT NULL CHECK(auto IN (0,1)),
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  released_at TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_reward_holds_active ON reward_holds(user_id, status, starts_at, ends_at);

CREATE TABLE entitlement_locks (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entitlement_key TEXT NOT NULL,
  reason TEXT NOT NULL CHECK(reason IN ('CHURN','CLAWBACK','ADMIN')),
  case_id INTEGER REFERENCES integrity_cases(id),
  created_at TEXT NOT NULL,
  UNIQUE(user_id, entitlement_key)
);

CREATE TABLE integrity_audit_runs (
  id INTEGER PRIMARY KEY,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  checks_json TEXT NOT NULL DEFAULT '{}',
  failures INTEGER NOT NULL DEFAULT 0
);
