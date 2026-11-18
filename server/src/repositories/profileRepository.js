export function createProfileRepository(db) {
  return {
    transaction(work) { return db.transaction(work).immediate(); },
    user(userId) {
      return db.prepare(`SELECT u.id,u.display_name AS displayName,u.timezone,u.created_at AS createdAt,p.equipped_theme AS equippedTheme,
        p.equipped_frame AS equippedFrame,p.showcase_json AS showcaseJson FROM users u LEFT JOIN user_profile p ON p.user_id=u.id WHERE u.id=?`).get(userId) ?? null;
    },
    badgeCounts(userId) {
      return db.prepare(`SELECT rarity,count(*) AS count FROM user_badges WHERE user_id=? AND status='ACTIVE' GROUP BY rarity`).all(userId);
    },
    activeBadges(userId) {
      return db.prepare(`SELECT b.badge_slug AS slug,b.tier,b.rarity,b.achieved_on AS achievedOn FROM user_badges b WHERE b.user_id=? AND b.status='ACTIVE'
        AND b.tier=(SELECT max(tier) FROM user_badges active WHERE active.user_id=b.user_id AND active.badge_slug=b.badge_slug AND active.status='ACTIVE')
        ORDER BY b.unlocked_at,b.badge_slug`)
        .all(userId);
    },
    ownsActiveBadge(userId, slug) {
      return Boolean(db.prepare("SELECT 1 FROM user_badges WHERE user_id=? AND badge_slug=? AND status='ACTIVE' LIMIT 1").get(userId,slug));
    },
    ownedCosmetics(userId) {
      return db.prepare(`SELECT c.item_slug AS itemSlug,c.acquired_at AS acquiredAt,p.item_type AS itemType FROM user_cosmetics c
        JOIN purchases p ON p.id=c.purchase_id WHERE c.user_id=? ORDER BY c.acquired_at,c.item_slug`).all(userId);
    },
    completedChallenges(userId) {
      return db.prepare("SELECT count(*) AS count FROM challenge_runs WHERE user_id=? AND status='COMPLETED'").get(userId).count;
    },
    recentActivity(userId, limit) {
      return db.prepare(`SELECT id,kind,occurred_at AS occurredAt,summary_code AS summaryCode
        FROM activity_items WHERE user_id=? AND kind IN ('BADGE','MISSION','CHALLENGE','STREAK','LEVEL') ORDER BY occurred_at DESC,id DESC LIMIT ?`).all(userId,limit);
    },
    saveShowcase(userId, slugs, updatedAt) {
      db.prepare(`INSERT INTO user_profile(user_id,showcase_json,updated_at) VALUES(?,?,?) ON CONFLICT(user_id)
        DO UPDATE SET showcase_json=excluded.showcase_json,updated_at=excluded.updated_at`).run(userId,JSON.stringify(slugs),updatedAt);
    },
    saveEquip(userId, slot, slug, updatedAt) {
      if (slot === 'THEME') db.prepare(`INSERT INTO user_profile(user_id,equipped_theme,updated_at) VALUES(?,?,?) ON CONFLICT(user_id)
        DO UPDATE SET equipped_theme=excluded.equipped_theme,updated_at=excluded.updated_at`).run(userId,slug,updatedAt);
      else db.prepare(`INSERT INTO user_profile(user_id,equipped_frame,updated_at) VALUES(?,?,?) ON CONFLICT(user_id)
        DO UPDATE SET equipped_frame=excluded.equipped_frame,updated_at=excluded.updated_at`).run(userId,slug,updatedAt);
    },
  };
}
