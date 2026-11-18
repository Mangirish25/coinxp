export function createMissionRepository(db) {
  function rows(userId, slot, periodKey) {
    return db.prepare(`SELECT id,user_id AS userId,slot,period_key AS periodKey,template_id AS templateId,status,
      generation_seq AS generationSeq,params_json AS paramsJson,assigned_at AS assignedAt,closed_at AS closedAt,xp_awarded AS xpAwarded
      FROM user_missions WHERE user_id=? AND slot=? AND period_key=? ORDER BY generation_seq DESC`).all(userId, slot, periodKey)
      .map(({ paramsJson, ...row }) => ({ ...row, params: JSON.parse(paramsJson) }));
  }
  return {
    transaction(work) { return db.transaction(work)(); },
    rows,
    history(userId, page, pageSize) {
      const total = db.prepare('SELECT count(*) AS total FROM user_missions WHERE user_id=?').get(userId).total;
      const data = db.prepare(`SELECT id,slot,period_key AS periodKey,template_id AS templateId,status,generation_seq AS generationSeq,
        assigned_at AS assignedAt,closed_at AS closedAt,xp_awarded AS xpAwarded FROM user_missions WHERE user_id=?
        ORDER BY period_key DESC,id DESC LIMIT ? OFFSET ?`).all(userId,pageSize,(page-1)*pageSize);
      return { data, total };
    },
    closeCandidates(userId) {
      return db.prepare("SELECT id,user_id AS userId,slot,period_key AS periodKey,template_id AS templateId,status,generation_seq AS generationSeq,params_json AS paramsJson,assigned_at AS assignedAt,closed_at AS closedAt,xp_awarded AS xpAwarded FROM user_missions WHERE user_id=? AND status IN ('ASSIGNED','DEFERRED') ORDER BY period_key,slot,id")
        .all(userId).map(({ paramsJson, ...row }) => ({ ...row, params: JSON.parse(paramsJson) }));
    },
    closeMission(userId, id, status, closedAt, xpAwarded = 0) {
      return db.prepare("UPDATE user_missions SET status=?,closed_at=?,xp_awarded=? WHERE id=? AND user_id=? AND status IN ('ASSIGNED','DEFERRED')")
        .run(status, closedAt, xpAwarded, id, userId).changes > 0;
    },
    completedUnpaid(userId) {
      return db.prepare("SELECT id,slot FROM user_missions WHERE user_id=? AND status='COMPLETED' AND xp_awarded=0 ORDER BY id").all(userId);
    },
    setMissionXp(userId, id, xp) {
      return db.prepare("UPDATE user_missions SET xp_awarded=? WHERE id=? AND user_id=? AND status='COMPLETED' AND xp_awarded=0").run(xp, id, userId).changes > 0;
    },
    insertActivity({ userId, refId, occurredAt, data }) {
      return db.prepare(`INSERT OR IGNORE INTO activity_items(user_id,kind,ref_type,ref_id,occurred_at,summary_code,data_json,dedupe_key)
        VALUES(?,'MISSION','MISSION',?,?,'MISSION_COMPLETED',?,?)`).run(userId,String(refId),occurredAt,JSON.stringify(data),`MISSION:${refId}:COMPLETED`).changes > 0;
    },
    periodFacts(userId, from, to, cutoff) {
      const tracked = db.prepare(`SELECT period_key AS date,details_json AS detailsJson FROM settlements WHERE user_id=? AND period_type='day'
        AND period_key>=? AND period_key<=? AND json_extract(details_json,'$.xpTracked')=1 ORDER BY period_key`).all(userId,from,to)
        .map(({ date, detailsJson }) => ({ date, details: JSON.parse(detailsJson) }));
      const countedBudgetDays = db.prepare(`SELECT s.period_key AS date FROM settlements s WHERE s.user_id=? AND s.period_type='day'
        AND s.period_key>=? AND s.period_key<=? AND s.outcome='PASS' AND EXISTS(SELECT 1 FROM xp_ledger l WHERE l.user_id=s.user_id
          AND l.entitlement_key='XP-003:'||s.period_key AND l.transition_no=(SELECT max(ll.transition_no) FROM xp_ledger ll WHERE ll.user_id=l.user_id AND ll.entitlement_key=l.entitlement_key)
          AND l.entry_type IN ('AWARD','REINSTATE')) ORDER BY s.period_key`).all(userId,from,to).map(({ date }) => date);
      const reviews = db.prepare(`SELECT local_date AS date FROM daily_reviews WHERE user_id=? AND local_date>=? AND local_date<=? AND xp_eligible=1 ORDER BY local_date`)
        .all(userId,from,to).map(({ date }) => date);
      const budgetHistory = db.prepare(`SELECT scope,category_id AS categoryId,month,action,new_amount_paise AS newAmountPaise,created_at AS createdAt
        FROM budget_history WHERE user_id=? AND created_at<=? ORDER BY created_at,id`).safeIntegers().all(userId,cutoff)
        .map(({ newAmountPaise, ...row }) => ({ ...row, newAmountPaise: newAmountPaise === null ? null : Number(newAmountPaise) }));
      const auditRows = db.prepare(`SELECT a.transaction_id AS transactionId,a.action,a.before_json AS beforeJson,a.after_json AS afterJson,a.created_at AS createdAt,a.id
        FROM transaction_audit a JOIN transactions t ON t.id=a.transaction_id WHERE a.user_id=? AND t.user_id=? AND a.created_at<=? ORDER BY a.transaction_id,a.created_at,a.id`)
        .all(userId,userId,cutoff).map((row) => ({ ...row, before: row.beforeJson === null ? null : JSON.parse(row.beforeJson), after: row.afterJson === null ? null : JSON.parse(row.afterJson) }));
      const categories = db.prepare('SELECT id,name FROM categories WHERE user_id IS NULL OR user_id=?').all(userId).map(({ id, name }) => ({ id: Number(id), name }));
      return { tracked, countedBudgetDays, reviews, budgetHistory, auditRows, categories };
    },
    countedBudgetDayCount(userId, from, to) {
      return db.prepare(`SELECT count(*) AS count FROM settlements s WHERE s.user_id=? AND s.period_type='day' AND s.period_key>=? AND s.period_key<=?
        AND s.outcome='PASS' AND EXISTS(SELECT 1 FROM xp_ledger l WHERE l.user_id=s.user_id AND l.entitlement_key='XP-003:'||s.period_key
          AND l.transition_no=(SELECT max(ll.transition_no) FROM xp_ledger ll WHERE ll.user_id=l.user_id AND ll.entitlement_key=l.entitlement_key)
          AND l.entry_type IN ('AWARD','REINSTATE'))`).get(userId,from,to).count;
    },
    replaceAssigned(userId, id) {
      return db.prepare("UPDATE user_missions SET status='REPLACED' WHERE id=? AND user_id=? AND status='ASSIGNED'").run(id, userId).changes > 0;
    },
    completedTemplates(userId) {
      return new Set(db.prepare("SELECT DISTINCT template_id AS templateId FROM user_missions WHERE user_id=? AND status='COMPLETED'")
        .all(userId).map(({ templateId }) => templateId));
    },
    previousTemplate(userId, slot, periodKey) {
      return db.prepare(`SELECT template_id AS templateId FROM user_missions WHERE user_id=? AND slot=? AND period_key<?
        AND status IN ('ASSIGNED','COMPLETED','EXPIRED','DEFERRED') ORDER BY period_key DESC,generation_seq DESC LIMIT 1`)
        .get(userId, slot, periodKey)?.templateId ?? null;
    },
    insert({ userId, slot, periodKey, templateId, generationSeq, params, assignedAt }) {
      const result = db.prepare(`INSERT OR IGNORE INTO user_missions(user_id,slot,period_key,template_id,status,generation_seq,params_json,assigned_at,catalog_version)
        VALUES(?,?,?,?,'ASSIGNED',?,?,?,?)`).run(userId, slot, periodKey, templateId, generationSeq, JSON.stringify(params), assignedAt, params.catalogVersion);
      return result.changes > 0;
    },
    assignmentFacts(userId, date, instant) {
      const prior = (from, to) => db.prepare(`SELECT count(*) AS count FROM settlements WHERE user_id=? AND period_type='day'
        AND period_key>=? AND period_key<=? AND outcome='PASS' AND json_extract(details_json,'$.xpTracked')=1`).get(userId, from, to).count;
      const daily = db.prepare(`WITH latest AS (
        SELECT scope,category_id,month,max(id) AS id FROM budget_history WHERE user_id=? AND scope='daily_limit'
          AND (month IS NULL OR month=?) AND created_at<=? GROUP BY scope,category_id,month
      ) SELECT h.action FROM latest l JOIN budget_history h ON h.id=l.id WHERE h.action IN ('set','update')
        ORDER BY (h.month IS NULL),h.created_at DESC LIMIT 1`)
        .get(userId, date.slice(0, 7), instant);
      const everCategory = db.prepare("SELECT 1 FROM budget_history WHERE user_id=? AND scope='category_monthly' AND action IN ('set','update') LIMIT 1").get(userId);
      const activeMonthly = db.prepare(`WITH latest AS (
        SELECT scope,category_id,month,max(id) AS id FROM budget_history WHERE user_id=? AND scope='monthly_total'
          AND created_at<=? GROUP BY scope,category_id,month
      ) SELECT 1 FROM latest l JOIN budget_history h ON h.id=l.id WHERE h.action IN ('set','update') LIMIT 1`).get(userId, instant);
      const last14 = prior(shift(date, -14), shift(date, -1));
      const previousMonth = shift(date.slice(0, 7) + '-01', -1).slice(0, 7);
      return {
        dailyLimitAtStart: Boolean(daily && daily.action !== 'delete'),
        hasEverSetCategoryBudget: Boolean(everCategory),
        hasPriorMonthlyBudget: Boolean(activeMonthly),
        trackedLast7: prior(shift(date, -7), shift(date, -1)),
        trackedLast14: last14,
        eligibleDays14: last14,
        previousMonthTracked: prior(`${previousMonth}-01`, `${previousMonth}-${String(new Date(Date.UTC(Number(previousMonth.slice(0, 4)), Number(previousMonth.slice(5, 7)), 0)).getUTCDate()).padStart(2, '0')}`),
      };
    },
  };
}

function shift(date, days) {
  const result = new Date(`${date}T00:00:00.000Z`);
  result.setUTCDate(result.getUTCDate() + days);
  return result.toISOString().slice(0, 10);
}
