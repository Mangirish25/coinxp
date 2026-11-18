import { createProfileRepository } from '../repositories/profileRepository.js';
import { localDateAt } from '../gamification/dateMath.js';
import { httpError } from '../utils/httpError.js';

export function createProfileService({ db, gameEngine, streakService }) {
  const repository = createProfileRepository(db);
  const config = gameEngine.rewardConfig();

  function get(userId) {
    const user = repository.user(userId);
    if (!user) throw httpError(404, 'USER_NOT_FOUND', 'User not found.');
    const progress = gameEngine.summary(userId);
    const streaks = streakService.summary(userId);
    const badgeCounts = Object.fromEntries(repository.badgeCounts(userId).map(({ rarity, count }) => [rarity, count]));
    const cosmetics = repository.ownedCosmetics(userId);
    return {
      id: user.id, displayName: user.displayName, memberSince: localDateAt(user.createdAt,user.timezone), level: progress.level,
      title: progress.title, lifetimeXp: progress.lifetimeXp, spendableXp: progress.spendableXp,
      currentStreak: streaks.tracking.current, longestStreak: streaks.tracking.longest, badgeCounts, badges: repository.activeBadges(userId),
      showcase: user.showcaseJson ? JSON.parse(user.showcaseJson) : [], equippedTheme: user.equippedTheme ?? null,
      equippedFrame: user.equippedFrame ?? null, ownedCosmetics: cosmetics,
      completedChallenges: repository.completedChallenges(userId), recentActivity: repository.recentActivity(userId,5),
    };
  }

  function saveShowcase(userId, slugs) {
    const unique = [...new Set(slugs)];
    if (unique.length !== slugs.length || unique.length > config.profile.showcaseMax) throw httpError(400,'SHOWCASE_TOO_MANY',`Choose up to ${config.profile.showcaseMax} different badges.`);
    for (const slug of unique) if (!repository.ownsActiveBadge(userId,slug)) throw httpError(422,'BADGE_NOT_OWNED','Only badges you have unlocked can be shown on your profile.');
    repository.transaction(() => repository.saveShowcase(userId,unique,gameEngine.clock.now().toISOString()));
    return get(userId);
  }

  function equip(userId, slot, itemSlug) {
    if (itemSlug !== null) {
      const item = config.shop.items.find(({ slug }) => slug === itemSlug);
      const expectedType = slot === 'THEME' ? 'THEME' : 'FRAME';
      if (!item || item.type !== expectedType || !repository.ownedCosmetics(userId).some(({ itemSlug: owned }) => owned === itemSlug)) {
        throw httpError(403,'NOT_OWNED','You do not own that cosmetic for this profile slot.');
      }
    }
    repository.transaction(() => repository.saveEquip(userId,slot,itemSlug,gameEngine.clock.now().toISOString()));
    return get(userId);
  }

  return { get, saveShowcase, equip };
}
