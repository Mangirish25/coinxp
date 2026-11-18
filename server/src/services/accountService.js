import { createAccountRepository } from '../repositories/accountRepository.js';
import { httpError } from '../utils/httpError.js';

const exportLimitMs = 60 * 60 * 1000;

export function createAccountService({ db, clock = { now: () => new Date() } }) {
  const repository = createAccountRepository(db);
  return {
    createExport(userId) {
      const now = clock.now();
      const cutoff = new Date(now.getTime() - exportLimitMs).toISOString();
      if (!repository.claimExport(userId, now.toISOString(), cutoff)) {
        throw httpError(429, 'RATE_LIMITED', 'An account export was already requested recently. Try again in about an hour.');
      }
      const profile = repository.profile(userId);
      if (!profile) throw httpError(404, 'USER_NOT_FOUND', 'User not found.');
      return { schemaVersion: 'coinxp-export-v1', exportedAt: now.toISOString(), profile, sections: repository.exportSections(userId) };
    },
  };
}
