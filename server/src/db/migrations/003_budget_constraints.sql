CREATE UNIQUE INDEX idx_budgets_unique_scope_period
  ON budgets (user_id, scope, COALESCE(category_id, 0), COALESCE(month, ''));

CREATE TABLE budget_history (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  budget_id INTEGER,
  scope TEXT NOT NULL CHECK (scope IN ('monthly_total', 'category_monthly', 'daily_limit')),
  category_id INTEGER,
  month TEXT,
  action TEXT NOT NULL CHECK (action IN ('set', 'update', 'delete')),
  old_amount_paise INTEGER,
  new_amount_paise INTEGER,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_budget_history_user_created ON budget_history(user_id, created_at);

CREATE TRIGGER budget_history_no_update
BEFORE UPDATE ON budget_history
BEGIN
  SELECT RAISE(ABORT, 'budget_history is append-only');
END;

CREATE TRIGGER budget_history_no_delete
BEFORE DELETE ON budget_history
BEGIN
  SELECT RAISE(ABORT, 'budget_history is append-only');
END;
