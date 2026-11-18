import { createUiPreferenceRepository } from '../repositories/uiPreferenceRepository.js';

const defaults = Object.freeze({ motionMode: 'SYSTEM', celebrations: 'ALL', sound: false, haptics: true });

export function createUiPreferenceService({ db, clock = { now: () => new Date() } }) {
  const repository = createUiPreferenceRepository(db);
  return {
    get(userId) { return repository.find(userId) ?? { ...defaults, updatedAt: null }; },
    save(userId, values) { return repository.save(userId, values, clock.now().toISOString()); },
  };
}
