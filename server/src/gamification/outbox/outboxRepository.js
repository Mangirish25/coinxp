import { randomUUID } from 'node:crypto';
import rules, { CONFIG_VERSION } from '../rules.config.js';

export function buildEnvelope({ eventId = randomUUID(), eventType, userId, occurredAt, localDate = null, timezone = null, data = {} }, clock) {
  return {
    eventId,
    eventType,
    userId,
    occurredAt: occurredAt ?? clock.now().toISOString(),
    localDate,
    timezone,
    schemaVersion: rules.events.schemaVersion,
    data,
    configVersion: CONFIG_VERSION,
  };
}

// EVT-002: callers invoke enqueue while their domain write transaction is open.
export function enqueue(db, event, { status = 'PENDING', dedupeKey = null } = {}) {
  const result = db.prepare(`INSERT OR IGNORE INTO domain_events
    (event_id,event_type,user_id,payload_json,local_date,timezone,schema_version,occurred_at,status,next_attempt_at,processed_at,dedupe_key)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    event.eventId,
    event.eventType,
    event.userId,
    JSON.stringify(event),
    event.localDate,
    event.timezone,
    event.schemaVersion,
    event.occurredAt,
    status,
    status === 'PENDING' ? event.occurredAt : null,
    status === 'PUBLISHED' ? event.occurredAt : null,
    dedupeKey,
  );
  return result.changes > 0 ? Number(result.lastInsertRowid) : null;
}

export function createOutboxRepository(db) {
  return {
    getForUser(userId, seq) {
      const row = db.prepare(`SELECT seq,event_id AS eventId,event_type AS eventType,user_id AS userId,payload_json AS payloadJson,
        status,attempts,next_attempt_at AS nextAttemptAt FROM domain_events WHERE user_id=? AND seq=?`).get(userId, seq);
      return row && { ...row, payload: JSON.parse(row.payloadJson) };
    },
    nextForUser(userId, now) {
      const row = db.prepare(`SELECT seq,event_id AS eventId,event_type AS eventType,user_id AS userId,payload_json AS payloadJson,
        status,attempts,next_attempt_at AS nextAttemptAt FROM domain_events
        WHERE user_id=? AND status IN ('PENDING','FAILED') AND (next_attempt_at IS NULL OR next_attempt_at<=?)
        ORDER BY seq LIMIT 1`).get(userId, now);
      return row && { ...row, payload: JSON.parse(row.payloadJson) };
    },
    pendingUsers(now, limit) {
      return db.prepare(`SELECT DISTINCT user_id AS userId FROM domain_events
        WHERE status IN ('PENDING','FAILED') AND (next_attempt_at IS NULL OR next_attempt_at<=?)
        ORDER BY user_id LIMIT ?`).all(now, limit).map((row) => row.userId);
    },
    countEventTypeSince(userId,eventType,since) {
      return db.prepare('SELECT count(*) AS count FROM domain_events WHERE user_id=? AND event_type=? AND occurred_at>=?').get(userId,eventType,since).count;
    },
    markProcessed(seq, now) {
      db.prepare(`UPDATE domain_events SET status='PROCESSED',processed_at=?,last_error=NULL WHERE seq=?`).run(now, seq);
    },
    markSkipped(seq, now) {
      db.prepare(`UPDATE domain_events SET status='SKIPPED',processed_at=? WHERE seq=?`).run(now, seq);
    },
    markFailed(seq, attempts, nextAttemptAt, error, dead) {
      db.prepare(`UPDATE domain_events SET status=?,attempts=?,next_attempt_at=?,last_error=? WHERE seq=?`)
        .run(dead ? 'DEAD' : 'FAILED', attempts, nextAttemptAt, String(error).slice(0, 500), seq);
    },
    deadCount() { return db.prepare("SELECT count(*) AS count FROM domain_events WHERE status='DEAD'").get().count; },
    requeueDead(userId = null) {
      const statement = userId === null
        ? db.prepare("UPDATE domain_events SET status='PENDING',attempts=0,next_attempt_at=NULL,last_error=NULL WHERE status='DEAD'")
        : db.prepare("UPDATE domain_events SET status='PENDING',attempts=0,next_attempt_at=NULL,last_error=NULL WHERE status='DEAD' AND user_id=?");
      return userId === null ? statement.run().changes : statement.run(userId).changes;
    },
    purgeProcessed(cutoff) {
      return db.prepare("DELETE FROM domain_events WHERE status IN ('PROCESSED','PUBLISHED','SKIPPED') AND processed_at<?").run(cutoff).changes;
    },
    purgeIdempotency(cutoff) {
      return db.prepare('DELETE FROM request_idempotency WHERE created_at<?').run(cutoff).changes;
    },
    updateStatus(seq, status) {
      return db.prepare('UPDATE domain_events SET status=? WHERE seq=?').run(status, seq).changes;
    },
  };
}
