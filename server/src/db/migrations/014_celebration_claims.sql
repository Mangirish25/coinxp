CREATE TABLE celebration_claims (
  notice_id INTEGER PRIMARY KEY REFERENCES user_notices(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  claimed_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE INDEX idx_celebration_claims_user_expiry ON celebration_claims(user_id, expires_at);
