-- Part 9: extend existing integrity restrictions and add reward-owned storage.
CREATE TABLE user_notices_v9 (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN ('INFO','WARNING','XP_CHANGE','RESTRICTION','REVIEW','PROGRESS','STREAK','REWARD')),
  code TEXT NOT NULL,
  data_json TEXT NOT NULL DEFAULT '{}',
  ledger_entry_id INTEGER REFERENCES xp_ledger(id),
  dedupe_key TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL,
  read_at TEXT
);
INSERT INTO user_notices_v9(id,user_id,kind,code,data_json,ledger_entry_id,dedupe_key,created_at,read_at)
  SELECT id,user_id,kind,code,data_json,ledger_entry_id,dedupe_key,created_at,read_at FROM user_notices;
DROP INDEX idx_user_notices_user_created;
DROP INDEX idx_user_notices_unread;
DROP TABLE user_notices;
ALTER TABLE user_notices_v9 RENAME TO user_notices;
CREATE INDEX idx_user_notices_user_created ON user_notices(user_id,created_at DESC,id DESC);
CREATE INDEX idx_user_notices_unread ON user_notices(user_id,read_at,id);

CREATE TABLE reward_holds_v9 (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  case_id INTEGER NOT NULL REFERENCES integrity_cases(id) ON DELETE CASCADE,
  scope TEXT NOT NULL CHECK(scope IN ('OUTCOME_XP','STREAK_XP','PROGRESSION_XP')),
  status TEXT NOT NULL CHECK(status IN ('ACTIVE','RELEASED','EXPIRED','CONFIRMED')),
  auto INTEGER NOT NULL CHECK(auto IN (0,1)),
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  released_at TEXT,
  created_at TEXT NOT NULL
);
INSERT INTO reward_holds_v9 SELECT id,user_id,case_id,scope,status,auto,starts_at,ends_at,released_at,created_at FROM reward_holds;
DROP INDEX idx_reward_holds_active;
DROP TABLE reward_holds;
ALTER TABLE reward_holds_v9 RENAME TO reward_holds;
CREATE INDEX idx_reward_holds_active ON reward_holds(user_id,status,starts_at,ends_at);

CREATE TRIGGER xp_ledger_spend_guard BEFORE INSERT ON xp_ledger
WHEN NEW.entry_type='SPEND' AND (NEW.lifetime_delta<>0 OR NEW.balance_delta=0)
BEGIN SELECT RAISE(ABORT,'SPEND must be balance-only and non-zero'); END;

CREATE TABLE user_badges (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  badge_slug TEXT NOT NULL,
  tier INTEGER NOT NULL CHECK(tier>0),
  rarity TEXT NOT NULL CHECK(rarity IN ('COMMON','UNCOMMON','RARE','EPIC','LEGENDARY')),
  xp_awarded INTEGER NOT NULL CHECK(xp_awarded>=0),
  unlocked_at TEXT NOT NULL,
  achieved_on TEXT NOT NULL,
  source_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL CHECK(status IN ('ACTIVE','REVOKED')),
  revoked_at TEXT,
  revoked_by TEXT,
  case_id INTEGER REFERENCES integrity_cases(id),
  revoke_reason TEXT,
  catalog_version TEXT NOT NULL,
  PRIMARY KEY(user_id,badge_slug,tier)
);

CREATE TABLE badge_progress (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  badge_slug TEXT NOT NULL,
  metric_value INTEGER NOT NULL DEFAULT 0,
  times_earned INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(user_id,badge_slug)
);

CREATE TABLE badge_repeatable_periods (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  badge_slug TEXT NOT NULL,
  period_key TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY(user_id,badge_slug,period_key)
);

CREATE TABLE user_missions (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slot TEXT NOT NULL CHECK(slot IN ('DAILY','WEEKLY','MONTHLY')),
  period_key TEXT NOT NULL,
  template_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('ASSIGNED','COMPLETED','EXPIRED','REPLACED','DEFERRED')),
  generation_seq INTEGER NOT NULL DEFAULT 0 CHECK(generation_seq>=0),
  params_json TEXT NOT NULL DEFAULT '{}',
  assigned_at TEXT NOT NULL,
  closed_at TEXT,
  xp_awarded INTEGER NOT NULL DEFAULT 0 CHECK(xp_awarded>=0),
  catalog_version TEXT NOT NULL,
  UNIQUE(user_id,slot,period_key,generation_seq)
);
CREATE UNIQUE INDEX idx_user_missions_active_slot ON user_missions(user_id,slot,period_key) WHERE status<>'REPLACED';
CREATE INDEX idx_user_missions_period ON user_missions(user_id,slot,period_key,status);

CREATE TABLE challenge_runs (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  challenge_slug TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('PENDING','ACTIVE','COMPLETED','FAILED','ABANDONED','CANCELLED','DEFERRED')),
  cost_xp INTEGER NOT NULL CHECK(cost_xp>=0),
  purchase_id INTEGER,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  qualifying_days INTEGER NOT NULL DEFAULT 0 CHECK(qualifying_days>=0),
  required_days INTEGER NOT NULL CHECK(required_days>=0),
  closed_at TEXT,
  xp_awarded INTEGER NOT NULL DEFAULT 0 CHECK(xp_awarded>=0),
  catalog_version TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX idx_challenge_runs_one_active ON challenge_runs(user_id) WHERE status IN ('PENDING','ACTIVE','DEFERRED');
CREATE INDEX idx_challenge_runs_user_created ON challenge_runs(user_id,created_at DESC,id DESC);

CREATE TABLE challenge_days (
  run_id INTEGER NOT NULL REFERENCES challenge_runs(id) ON DELETE CASCADE,
  local_date TEXT NOT NULL,
  qualified INTEGER NOT NULL CHECK(qualified IN (0,1)),
  details_json TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL CHECK(status IN ('FINAL','DEFERRED')),
  PRIMARY KEY(run_id,local_date)
);

CREATE TABLE purchases (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_slug TEXT NOT NULL,
  item_type TEXT NOT NULL CHECK(item_type IN ('FREEZE','THEME','FRAME','CHALLENGE')),
  cost_xp INTEGER NOT NULL CHECK(cost_xp>=0),
  ledger_entry_id INTEGER NOT NULL UNIQUE REFERENCES xp_ledger(id),
  status TEXT NOT NULL CHECK(status IN ('COMPLETED','REFUNDED')),
  idempotency_key TEXT NOT NULL,
  created_at TEXT NOT NULL,
  meta_json TEXT NOT NULL DEFAULT '{}',
  UNIQUE(user_id,idempotency_key)
);
CREATE INDEX idx_purchases_user_created ON purchases(user_id,created_at DESC,id DESC);

CREATE TABLE user_cosmetics (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_slug TEXT NOT NULL,
  purchase_id INTEGER NOT NULL REFERENCES purchases(id),
  acquired_at TEXT NOT NULL,
  PRIMARY KEY(user_id,item_slug)
);

CREATE TABLE user_profile (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  equipped_theme TEXT,
  equipped_frame TEXT,
  showcase_json TEXT NOT NULL DEFAULT '[]',
  updated_at TEXT NOT NULL
);

CREATE TABLE notification_preferences (
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  category TEXT NOT NULL CHECK(category IN ('PROGRESS','STREAK','WARNING','REWARD','INFO','RESTRICTION','REVIEW','XP_CHANGE')),
  enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0,1)),
  updated_at TEXT NOT NULL,
  PRIMARY KEY(user_id,category)
);

CREATE TABLE activity_items (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK(kind IN ('TRANSACTION','XP','STREAK','BADGE','MISSION','CHALLENGE','PURCHASE','NOTICE','LEVEL')),
  ref_type TEXT,
  ref_id TEXT,
  occurred_at TEXT NOT NULL,
  summary_code TEXT NOT NULL,
  data_json TEXT NOT NULL DEFAULT '{}',
  dedupe_key TEXT NOT NULL UNIQUE
);
CREATE INDEX idx_activity_items_user_cursor ON activity_items(user_id,occurred_at DESC,id DESC);
