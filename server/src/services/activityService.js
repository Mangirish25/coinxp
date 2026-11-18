import rules from '../gamification/rules.config.js';
import { createActivityRepository } from '../repositories/activityRepository.js';

export function createActivityService({ db }) {
  const repository = createActivityRepository(db);
  return { list(userId, filters) {
    const result = repository.list(userId, { ...filters, limit: filters.limit ?? rules.rewards.activity.pageSize });
    return { ...result, pageSize: filters.limit ?? rules.rewards.activity.pageSize };
  } };
}
