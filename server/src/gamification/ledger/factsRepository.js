export function createGamificationFactsRepository(db) {
  return {
    user(userId) { return db.prepare(`SELECT id,timezone,created_at AS createdAt,timezone_changed_at AS timezoneChangedAt FROM users WHERE id=?`).get(userId); },
    candidateDates(userId, fromDate, throughDate) {
      return db.prepare(`SELECT d.local_date AS date FROM daily_reviews d WHERE d.user_id=? AND d.local_date>=? AND d.local_date<=?
        AND NOT EXISTS (SELECT 1 FROM settlements s WHERE s.user_id=d.user_id AND s.period_type='day' AND s.period_key=d.local_date)
        UNION SELECT t.transaction_date AS date FROM transactions t WHERE t.user_id=? AND t.deleted_at IS NULL
        AND t.transaction_date>=? AND t.transaction_date<=?
        AND NOT EXISTS (SELECT 1 FROM settlements s WHERE s.user_id=t.user_id AND s.period_type='day' AND s.period_key=t.transaction_date)
        ORDER BY date`).all(userId,fromDate,throughDate,userId,fromDate,throughDate).map((row)=>row.date);
    },
    review(userId, date) {
      return db.prepare(`SELECT id,local_date AS localDate,completed_at AS completedAt,no_spend_declared AS noSpendDeclared,
        xp_eligible AS xpEligible,summary_json AS summaryJson FROM daily_reviews WHERE user_id=? AND local_date=?`).get(userId,date);
    },
    countNoSpendSince(userId, fromDate, toDate) {
      return db.prepare(`SELECT count(*) AS count FROM daily_reviews WHERE user_id=? AND no_spend_declared=1
        AND local_date>=? AND local_date<=?`).get(userId, fromDate, toDate).count;
    },
    hasAnyReview(userId) { return db.prepare('SELECT 1 AS yes FROM daily_reviews WHERE user_id=? LIMIT 1').get(userId)!==undefined; },
    hasAnyBudget(userId) { return db.prepare('SELECT 1 AS yes FROM budget_history WHERE user_id=? AND action IN (\'set\',\'update\') LIMIT 1').get(userId)!==undefined; },
    reviewCountWeek(userId, weekStart, beforeDate) {
      return db.prepare(`SELECT count(*) AS count FROM daily_reviews WHERE user_id=? AND local_date>=? AND local_date<? AND no_spend_declared=1 AND xp_eligible=1`).get(userId,weekStart,beforeDate).count;
    },
    insertReview({userId,date,completedAt,noSpend,xpEligible,summary}) {
      const result=db.prepare(`INSERT OR IGNORE INTO daily_reviews(user_id,local_date,completed_at,no_spend_declared,xp_eligible,summary_json) VALUES(?,?,?,?,?,?)`)
        .run(userId,date,completedAt,noSpend?1:0,xpEligible?1:0,JSON.stringify(summary));
      return {inserted:result.changes>0,review:this.review(userId,date)};
    },
    pendingReviews(userId, from, to) {
      return db.prepare(`SELECT local_date AS localDate,no_spend_declared AS noSpendDeclared,xp_eligible AS xpEligible,summary_json AS summaryJson
        FROM daily_reviews WHERE user_id=? AND local_date>=? AND local_date<=? ORDER BY local_date`).all(userId,from,to)
        .map((row)=>({...row,summary:JSON.parse(row.summaryJson)}));
    },
    auditRowsAsOf(userId, instant) {
      return db.prepare(`SELECT a.transaction_id AS transactionId,a.action,a.before_json AS beforeJson,a.after_json AS afterJson,a.created_at AS createdAt,a.id
        FROM transaction_audit a JOIN transactions t ON t.id=a.transaction_id WHERE a.user_id=? AND t.user_id=? AND a.created_at<=?
        ORDER BY a.transaction_id,a.created_at,a.id`).all(userId,userId,instant).map((row)=>({...row,
          before:row.beforeJson===null?null:JSON.parse(row.beforeJson),after:row.afterJson===null?null:JSON.parse(row.afterJson)}));
    },
    currentTransactionFacts(userId, from, to, minimumPaise) {
      return db.prepare(`SELECT id,category_id AS categoryId,type,amount_paise AS amountPaise,transaction_date AS transactionDate,
        created_local_date AS createdLocalDate,deleted_at AS deletedAt FROM transactions WHERE user_id=? AND transaction_date>=? AND transaction_date<=?`)
        .safeIntegers().all(userId,from,to).map((row)=>({...row,amountPaise:Number(row.amountPaise),live:row.deletedAt===null&&row.createdLocalDate===row.transactionDate&&row.amountPaise>=minimumPaise}));
    },
    currentExpenseTotal(userId, from, to) {
      return Number(db.prepare(`SELECT COALESCE(SUM(amount_paise),0) AS amount FROM transactions WHERE user_id=? AND deleted_at IS NULL AND type='expense'
        AND transaction_date>=? AND transaction_date<=?`).safeIntegers().get(userId,from,to).amount);
    },
    currentAdherenceSpend(userId, from, to) {
      return Number(db.prepare(`SELECT COALESCE(SUM(amount_paise),0) AS amount FROM transactions WHERE user_id=? AND deleted_at IS NULL
        AND type='expense' AND is_unexpected=0 AND transaction_date>=? AND transaction_date<=?`).safeIntegers().get(userId,from,to).amount);
    },
    currentLiveCount(userId, date, minimumPaise) {
      return db.prepare(`SELECT count(*) AS count FROM transactions WHERE user_id=? AND deleted_at IS NULL AND transaction_date=? AND created_local_date=? AND amount_paise>=?`)
        .get(userId,date,date,minimumPaise).count;
    },
    hasLiveTransaction(userId, minimumPaise) {
      return db.prepare(`SELECT 1 AS yes FROM transactions WHERE user_id=? AND deleted_at IS NULL
        AND created_local_date=transaction_date AND amount_paise>=? LIMIT 1`).get(userId,minimumPaise)!==undefined;
    },
    hasExpense(userId, date) {
      return db.prepare(`SELECT 1 AS yes FROM transactions WHERE user_id=? AND deleted_at IS NULL AND type='expense' AND transaction_date=? LIMIT 1`).get(userId,date)!==undefined;
    },
    budgetHistory(userId, instant) {
      return db.prepare(`SELECT scope,category_id AS categoryId,month,action,new_amount_paise AS newAmountPaise,created_at AS createdAt,id
        FROM budget_history WHERE user_id=? AND created_at<=? ORDER BY created_at,id`).safeIntegers().all(userId,instant).map((row)=>({...row,
          categoryId:row.categoryId===null?null:Number(row.categoryId),newAmountPaise:row.newAmountPaise===null?null:Number(row.newAmountPaise)}));
    },
    budgetHistoryAll(userId) {
      return db.prepare(`SELECT scope,category_id AS categoryId,month,action,new_amount_paise AS newAmountPaise,created_at AS createdAt,id
        FROM budget_history WHERE user_id=? ORDER BY created_at,id`).safeIntegers().all(userId).map((row)=>({...row,
          categoryId:row.categoryId===null?null:Number(row.categoryId),newAmountPaise:row.newAmountPaise===null?null:Number(row.newAmountPaise)}));
    },
  };
}
