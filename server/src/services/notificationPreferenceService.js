import rules from '../gamification/rules.config.js';
import { createNotificationPreferenceRepository } from '../repositories/notificationPreferenceRepository.js';
import { httpError } from '../utils/httpError.js';

const categories = ['PROGRESS','REWARD','STREAK','WARNING','INFO','RESTRICTION','REVIEW','XP_CHANGE'];
export function createNotificationPreferenceService({ db, clock = { now: () => new Date() } }) {
  const repository = createNotificationPreferenceRepository(db);
  function preferences(userId) {
    const saved = new Map(repository.list(userId).map((row) => [row.category, Boolean(row.enabled)]));
    return categories.map((category) => ({ category, enabled: rules.rewards.notifications.locked.includes(category) ? true : (saved.get(category) ?? true), mutable: rules.rewards.notifications.mutable.includes(category) }));
  }
  return { preferences, update(userId, changes) {
    for (const change of changes) {
      if (!rules.rewards.notifications.mutable.includes(change.category)) throw httpError(422,'PREFERENCE_LOCKED',`${change.category} notifications cannot be muted.`);
    }
    const at = clock.now().toISOString();
    db.transaction(() => changes.forEach(({ category, enabled }) => repository.set(userId,category,enabled,at)))();
    return { preferences: preferences(userId) };
  } };
}
