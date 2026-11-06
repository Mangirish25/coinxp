ALTER TABLE categories ADD COLUMN deleted_at TEXT;

CREATE UNIQUE INDEX idx_categories_active_user_name_type
  ON categories (user_id, name COLLATE NOCASE, type)
  WHERE user_id IS NOT NULL AND deleted_at IS NULL;

CREATE TABLE transaction_audit (
  id INTEGER PRIMARY KEY,
  transaction_id INTEGER NOT NULL REFERENCES transactions(id),
  user_id INTEGER NOT NULL REFERENCES users(id),
  action TEXT NOT NULL CHECK (action IN ('create', 'update', 'delete', 'restore')),
  before_json TEXT,
  after_json TEXT,
  changed_fields TEXT,
  reason TEXT CHECK (reason IS NULL OR length(reason) <= 200),
  created_at TEXT NOT NULL
);

CREATE INDEX idx_transaction_audit_transaction ON transaction_audit(transaction_id);
CREATE INDEX idx_transaction_audit_user_created ON transaction_audit(user_id, created_at);

CREATE TRIGGER transaction_audit_no_update
BEFORE UPDATE ON transaction_audit
BEGIN
  SELECT RAISE(ABORT, 'transaction_audit is append-only');
END;

CREATE TRIGGER transaction_audit_no_delete
BEFORE DELETE ON transaction_audit
BEGIN
  SELECT RAISE(ABORT, 'transaction_audit is append-only');
END;
