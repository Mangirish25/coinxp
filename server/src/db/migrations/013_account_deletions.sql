CREATE TABLE account_deletions (
  id INTEGER PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE,
  requested_at TEXT NOT NULL,
  scheduled_for TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('PENDING','CANCELLED','PURGING','COMPLETED')),
  cancelled_at TEXT,
  completed_at TEXT
);
CREATE INDEX idx_account_deletions_due ON account_deletions(status,scheduled_for);

DROP TRIGGER transaction_audit_no_delete;
CREATE TRIGGER transaction_audit_no_delete BEFORE DELETE ON transaction_audit
WHEN NOT EXISTS (SELECT 1 FROM account_deletions WHERE user_id=OLD.user_id AND status='PURGING')
BEGIN SELECT RAISE(ABORT, 'transaction_audit is append-only'); END;

DROP TRIGGER budget_history_no_delete;
CREATE TRIGGER budget_history_no_delete BEFORE DELETE ON budget_history
WHEN NOT EXISTS (SELECT 1 FROM account_deletions WHERE user_id=OLD.user_id AND status='PURGING')
BEGIN SELECT RAISE(ABORT, 'budget_history is append-only'); END;

DROP TRIGGER xp_ledger_no_delete;
CREATE TRIGGER xp_ledger_no_delete BEFORE DELETE ON xp_ledger
WHEN NOT EXISTS (SELECT 1 FROM account_deletions WHERE user_id=OLD.user_id AND status='PURGING')
BEGIN SELECT RAISE(ABORT, 'xp_ledger is append-only'); END;

DROP TRIGGER streak_milestones_no_delete;
CREATE TRIGGER streak_milestones_no_delete BEFORE DELETE ON streak_milestones
WHEN NOT EXISTS (SELECT 1 FROM account_deletions WHERE user_id=OLD.user_id AND status='PURGING')
BEGIN SELECT RAISE(ABORT, 'streak milestones are append-only'); END;

DROP TRIGGER freeze_ledger_no_delete;
CREATE TRIGGER freeze_ledger_no_delete BEFORE DELETE ON freeze_ledger
WHEN NOT EXISTS (SELECT 1 FROM account_deletions WHERE user_id=OLD.user_id AND status='PURGING')
BEGIN SELECT RAISE(ABORT, 'freeze ledger is append-only'); END;

DROP TRIGGER timezone_changes_no_delete;
CREATE TRIGGER timezone_changes_no_delete BEFORE DELETE ON timezone_changes
WHEN NOT EXISTS (SELECT 1 FROM account_deletions WHERE user_id=OLD.user_id AND status='PURGING')
BEGIN SELECT RAISE(ABORT, 'timezone history is append-only'); END;

DROP TRIGGER case_actions_no_delete;
CREATE TRIGGER case_actions_no_delete BEFORE DELETE ON case_actions
WHEN NOT EXISTS (
  SELECT 1 FROM integrity_cases c JOIN account_deletions d ON d.user_id=c.user_id
  WHERE c.id=OLD.case_id AND d.status='PURGING'
)
BEGIN SELECT RAISE(ABORT, 'case_actions is append-only'); END;
