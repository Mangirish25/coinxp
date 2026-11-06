CREATE TABLE users (
  id INTEGER PRIMARY KEY,
  email TEXT NOT NULL UNIQUE CHECK (email = lower(email)),
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'Asia/Kolkata',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE categories (
  id INTEGER PRIMARY KEY,
  user_id INTEGER REFERENCES users(id),
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  icon TEXT,
  is_default INTEGER NOT NULL DEFAULT 0 CHECK (is_default IN (0, 1)),
  created_at TEXT NOT NULL,
  UNIQUE (user_id, name, type)
);

CREATE TABLE transactions (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  category_id INTEGER NOT NULL REFERENCES categories(id),
  type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
  description TEXT,
  transaction_date TEXT NOT NULL CHECK (
    length(transaction_date) = 10 AND transaction_date GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'
  ),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT
);
CREATE INDEX idx_transactions_user_date ON transactions(user_id, transaction_date);
CREATE INDEX idx_transactions_user_category ON transactions(user_id, category_id);
CREATE INDEX idx_transactions_user_deleted ON transactions(user_id, deleted_at);

CREATE TABLE budgets (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id),
  scope TEXT NOT NULL CHECK (scope IN ('monthly_total', 'category_monthly', 'daily_limit')),
  category_id INTEGER REFERENCES categories(id),
  amount_paise INTEGER NOT NULL CHECK (amount_paise >= 0),
  month TEXT CHECK (month IS NULL OR (length(month) = 7 AND month GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]')),
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  CHECK ((scope = 'category_monthly' AND category_id IS NOT NULL) OR (scope <> 'category_monthly' AND category_id IS NULL))
);
CREATE INDEX idx_budgets_user_scope ON budgets(user_id, scope);
