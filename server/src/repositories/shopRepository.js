export function createShopRepository(db) {
  return {
    transaction(work) { return db.transaction(work).immediate(); },
    nextPurchaseId() { return db.prepare('SELECT COALESCE(MAX(id),0)+1 AS id FROM purchases').get().id; },
    purchaseByKey(userId, key) {
      return db.prepare(`SELECT id,user_id AS userId,item_slug AS itemSlug,item_type AS itemType,cost_xp AS costXp,ledger_entry_id AS ledgerEntryId,
        status,idempotency_key AS idempotencyKey,created_at AS createdAt,meta_json AS metaJson FROM purchases WHERE user_id=? AND idempotency_key=?`)
        .get(userId,key) ?? null;
    },
    insertPurchase({ id,userId,itemSlug,itemType,costXp,ledgerEntryId,idempotencyKey,createdAt,meta }) {
      db.prepare(`INSERT INTO purchases(id,user_id,item_slug,item_type,cost_xp,ledger_entry_id,status,idempotency_key,created_at,meta_json)
        VALUES(?,?,?,?,?,?,'COMPLETED',?,?,?)`).run(id,userId,itemSlug,itemType,costXp,ledgerEntryId,idempotencyKey,createdAt,JSON.stringify(meta));
      return id;
    },
    owned(userId, slug) { return db.prepare('SELECT 1 AS yes FROM user_cosmetics WHERE user_id=? AND item_slug=?').get(userId,slug) !== undefined; },
    ownedItems(userId) { return new Set(db.prepare('SELECT item_slug AS slug FROM user_cosmetics WHERE user_id=?').all(userId).map(({ slug }) => slug)); },
    addCosmetic({ userId, slug, purchaseId, acquiredAt }) {
      return db.prepare('INSERT OR IGNORE INTO user_cosmetics(user_id,item_slug,purchase_id,acquired_at) VALUES(?,?,?,?)')
        .run(userId,slug,purchaseId,acquiredAt).changes > 0;
    },
    freezePurchaseCount(userId, since) {
      return db.prepare("SELECT count(*) AS count FROM purchases WHERE user_id=? AND item_type='FREEZE' AND created_at>=? AND status='COMPLETED'").get(userId,since).count;
    },
    purchases(userId, limit = 50) {
      return db.prepare(`SELECT id,item_slug AS itemSlug,item_type AS itemType,cost_xp AS costXp,ledger_entry_id AS ledgerEntryId,status,created_at AS createdAt,meta_json AS metaJson
        FROM purchases WHERE user_id=? ORDER BY created_at DESC,id DESC LIMIT ?`).safeIntegers().all(userId,limit)
        .map(({ metaJson, ...row }) => ({ ...row, meta: JSON.parse(metaJson) }));
    },
    adminPurchase(id) { return db.prepare(`SELECT id,user_id AS userId,item_slug AS itemSlug,item_type AS itemType,cost_xp AS costXp,
      ledger_entry_id AS ledgerEntryId,status,created_at AS createdAt FROM purchases WHERE id=?`).get(id)??null; },
    refundPurchase(id) { return db.prepare("UPDATE purchases SET status='REFUNDED' WHERE id=? AND status='COMPLETED'").run(id).changes>0; },
    removeCosmetic(userId,slug) { return db.prepare('DELETE FROM user_cosmetics WHERE user_id=? AND item_slug=?').run(userId,slug).changes>0; },
    unequipCosmetic(userId,slug,updatedAt) { db.prepare('UPDATE user_profile SET equipped_theme=CASE WHEN equipped_theme=? THEN NULL ELSE equipped_theme END,equipped_frame=CASE WHEN equipped_frame=? THEN NULL ELSE equipped_frame END,updated_at=? WHERE user_id=?').run(slug,slug,updatedAt,userId); },
    insertRefundActivity({userId,id,at,data}) { db.prepare(`INSERT OR IGNORE INTO activity_items(user_id,kind,ref_type,ref_id,occurred_at,summary_code,data_json,dedupe_key)
      VALUES(?,'PURCHASE','PURCHASE',?,?,'PURCHASE_REFUNDED',?,?)`).run(userId,String(id),at,JSON.stringify(data),`PURCHASE:${id}:REFUNDED`); },
    insertRefundNotice({userId,id,at,data}) { db.prepare(`INSERT OR IGNORE INTO user_notices(user_id,kind,code,data_json,dedupe_key,created_at)
      VALUES(?,'REWARD','PURCHASE_REFUNDED',?,?,?)`).run(userId,JSON.stringify(data),`PURCHASE:${id}:REFUNDED:NOTICE`,at); },
    insertActivity({ userId, id, createdAt, data }) {
      return db.prepare(`INSERT OR IGNORE INTO activity_items(user_id,kind,ref_type,ref_id,occurred_at,summary_code,data_json,dedupe_key)
        VALUES(?,'PURCHASE','PURCHASE',?,?,'PURCHASE_COMPLETED',?,?)`).run(userId,String(id),createdAt,JSON.stringify(data),`PURCHASE:${id}`).changes > 0;
    },
    insertNotice({ userId, data, createdAt, dedupeKey }) {
      return db.prepare(`INSERT OR IGNORE INTO user_notices(user_id,kind,code,data_json,dedupe_key,created_at)
        VALUES(?,'REWARD','PURCHASE_COMPLETED',?,?,?)`).run(userId,JSON.stringify(data),dedupeKey,createdAt).changes > 0;
    },
  };
}
