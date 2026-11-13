export function createRequestIdempotencyRepository(db) {
  return {
    find(userId, key) {
      const row = db.prepare('SELECT request_hash AS requestHash,response_status AS responseStatus,response_body AS responseBody FROM request_idempotency WHERE user_id=? AND idempotency_key=?').get(userId, key);
      return row ? { ...row, response: JSON.parse(row.responseBody) } : null;
    },
    insert({ userId, key, requestHash, responseStatus, response, createdAt }) {
      return db.prepare('INSERT INTO request_idempotency(user_id,idempotency_key,request_hash,response_status,response_body,created_at) VALUES(?,?,?,?,?,?)')
        .run(userId, key, requestHash, responseStatus, JSON.stringify(response), createdAt).changes;
    },
  };
}
