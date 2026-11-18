CREATE TABLE activity_backfill_runs (
  id INTEGER PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  actor TEXT NOT NULL,
  note TEXT NOT NULL,
  inserted_count INTEGER NOT NULL CHECK(inserted_count>=0),
  created_at TEXT NOT NULL
);
CREATE INDEX idx_activity_backfill_runs_created ON activity_backfill_runs(created_at DESC,id DESC);
