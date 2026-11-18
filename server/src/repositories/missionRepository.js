export function createMissionRepository(db) {
  function rows(userId, slot, periodKey) {
    return db.prepare(`SELECT id,user_id AS userId,slot,period_key AS periodKey,template_id AS templateId,status,
      generation_seq AS generationSeq,params_json AS paramsJson,assigned_at AS assignedAt,closed_at AS closedAt,xp_awarded AS xpAwarded
      FROM user_missions WHERE user_id=? AND slot=? AND period_key=? ORDER BY generation_seq DESC`).all(userId, slot, periodKey)
      .map((row) => ({ ...row, params: JSON.parse(row.paramsJson) }));
  }
  return {
    rows,
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
      ) SELECT h.action FROM latest l JOIN budget_history h ON h.id=l.id ORDER BY (h.month IS NULL),h.created_at DESC LIMIT 1`)
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
