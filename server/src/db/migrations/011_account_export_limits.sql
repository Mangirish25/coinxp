CREATE TABLE account_export_limits (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  last_export_at TEXT NOT NULL
);
