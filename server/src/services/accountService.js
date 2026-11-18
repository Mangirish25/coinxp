import argon2 from 'argon2';
import { createAccountRepository } from '../repositories/accountRepository.js';
import { createUserRepository } from '../repositories/userRepository.js';
import { ACCOUNT_CONFIG } from '../config/accountConfig.js';
import { httpError } from '../utils/httpError.js';

const exportLimitMs = 60 * 60 * 1000;

export function createAccountService({ db, clock = { now: () => new Date() } }) {
  const repository = createAccountRepository(db);
  const users = createUserRepository(db);
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
    async scheduleDeletion(userId, password) {
      const user = users.findById(userId);
      if (!user || !(await argon2.verify(user.password_hash, password).catch(() => false))) {
        throw httpError(400, 'INVALID_PASSWORD', 'Your current password is incorrect.');
      }
      const now = clock.now();
      const scheduledFor = new Date(now.getTime() + ACCOUNT_CONFIG.deletionGraceDays * 24 * 60 * 60 * 1000);
      return repository.scheduleDeletion(userId, now.toISOString(), scheduledFor.toISOString());
    },
    restoreDeletion(userId) {
      const state = repository.deletionStatus(userId);
      if (!state || state.status === 'COMPLETED') throw httpError(404, 'DELETION_NOT_FOUND', 'No pending account deletion was found.');
      const now = clock.now();
      if (state.status === 'PENDING' && state.scheduledFor <= now.toISOString()) {
        throw httpError(410, 'DELETION_EXPIRED', 'The account deletion period has ended. This account can no longer be restored.');
      }
      if (state.status === 'PENDING') repository.restoreDeletion(userId, now.toISOString());
      const user = users.findById(userId);
      return { id: user.id, email: user.email, displayName: user.display_name, timezone: user.timezone, createdAt: user.created_at };
    },
    purgeDue() {
      const now = clock.now().toISOString();
      let purged = 0;
      for (const { userId } of repository.dueDeletions(now)) if (repository.purgeUser(userId, now)) purged += 1;
      return purged;
    },
  };
}
