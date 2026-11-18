import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import { AUTH_CONFIG, DUMMY_PASSWORD_HASH } from '../config/authConstants.js';
import { createUserRepository } from '../repositories/userRepository.js';
import { nowIso } from '../utils/dates.js';
import { httpError } from '../utils/httpError.js';
import rules from '../gamification/rules.config.js';
import { createTimezoneChangeRepository } from '../repositories/timezoneChangeRepository.js';
import { localDateAt, shiftDate } from '../gamification/dateMath.js';

function publicUser(user) {
  return {
    id: user.id,
    email: user.email,
    displayName: user.display_name,
    timezone: user.timezone,
    createdAt: user.created_at,
  };
}

function resolveTimezone(timezone) {
  if (!timezone) return AUTH_CONFIG.defaultTimezone;
  try {
    new Intl.DateTimeFormat('en', { timeZone: timezone });
    return timezone;
  } catch {
    return AUTH_CONFIG.defaultTimezone;
  }
}

function createToken(user, secret) {
  return jwt.sign({ ver: user.token_version ?? 0 }, secret, {
    subject: String(user.id),
    expiresIn: AUTH_CONFIG.tokenTtlSeconds,
    algorithm: 'HS256',
  });
}

function isUniqueEmailError(error) {
  return error.code === 'SQLITE_CONSTRAINT_UNIQUE' || error.code === 'SQLITE_CONSTRAINT_PRIMARYKEY';
}

export function createAuthService({ db, secret, gameEngine }) {
  const users = createUserRepository(db);
  const timezoneChanges = createTimezoneChangeRepository(db);

  return {
    async register({ email, password, displayName, timezone }) {
      if (users.findByEmail(email)) {
        throw httpError(409, 'EMAIL_TAKEN', 'An account with this email already exists.');
      }

      const passwordHash = await argon2.hash(password, AUTH_CONFIG.argon2Options);
      const createdAt = gameEngine?.clock.now().toISOString() ?? nowIso();
      let user;
      try {
        user = db.transaction(() => {
          const created = users.create({ email, passwordHash, displayName, timezone: resolveTimezone(timezone), createdAt });
          gameEngine?.enqueue({ eventType: 'USER_REGISTERED', userId: created.id, occurredAt: createdAt,
            localDate: gameEngine.localDate(created.id, new Date(createdAt)), timezone: created.timezone,
            data: { userId: created.id } });
          return created;
        })();
      } catch (error) {
        if (isUniqueEmailError(error)) {
          throw httpError(409, 'EMAIL_TAKEN', 'An account with this email already exists.');
        }
        throw error;
      }

      if (gameEngine) { try { gameEngine.processUser(user.id); } catch { /* registration remains successful after commit */ } }
      return { user: publicUser(user), token: createToken(user, secret) };
    },

    async login({ email, password }) {
      const user = users.findByEmail(email);
      if (!user) {
        await argon2.verify(DUMMY_PASSWORD_HASH, password);
        throw httpError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
      }

      const passwordMatches = await argon2.verify(user.password_hash, password).catch(() => false);
      if (!passwordMatches) {
        throw httpError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
      }

      return { user: publicUser(user), token: createToken(user, secret) };
    },

    async changePassword(userId, { currentPassword, newPassword }) {
      const user = users.findById(userId);
      if (!user) throw httpError(404, 'USER_NOT_FOUND', 'User not found.');
      const valid = await argon2.verify(user.password_hash, currentPassword).catch(() => false);
      if (!valid) throw httpError(400, 'INVALID_PASSWORD', 'Your current password is incorrect.');
      if (await argon2.verify(user.password_hash, newPassword).catch(() => false)) {
        throw httpError(400, 'PASSWORD_REUSE', 'Choose a new password that you have not used before.');
      }
      const passwordHash = await argon2.hash(newPassword, AUTH_CONFIG.argon2Options);
      const updatedAt = gameEngine?.clock.now().toISOString() ?? nowIso();
      db.transaction(() => users.updatePassword({ id: userId, passwordHash, updatedAt }))();
      const updated = users.findById(userId);
      return { user: publicUser(updated), token: createToken(updated, secret) };
    },

    findPublicUserById(id) {
      const user = users.findById(id);
      return user ? publicUser(user) : null;
    },

    findSessionUserById(id) {
      const user = users.findById(id);
      return user ? { user: publicUser(user), tokenVersion: user.token_version ?? 0 } : null;
    },

    updateTimezone(id, timezone) {
      const current = users.timezoneSettings(id);
      if (!current) throw httpError(404, 'USER_NOT_FOUND', 'User not found.');
      let normalized;
      try { new Intl.DateTimeFormat('en', { timeZone: timezone }); normalized = timezone; }
      catch { throw httpError(400, 'INVALID_TIMEZONE', 'Choose a valid time zone.'); }
      if (current.timezone === normalized) return publicUser(users.findById(id));
      const now = gameEngine?.clock.now() ?? new Date();
      const oldLocalDate = localDateAt(now, current.timezone);
      const newLocalDate = localDateAt(now, normalized);
      if (current.timezoneChangedAt) {
        const elapsed = now.getTime() - new Date(current.timezoneChangedAt).getTime();
        const cooldownMs = rules.timezone.changeCooldownDays * rules.units.hoursPerDay * rules.units.minutesPerHour * rules.units.secondsPerMinute * rules.units.millisecondsPerSecond;
        if (elapsed < cooldownMs) throw httpError(429, 'TIMEZONE_COOLDOWN', `You can change your time zone once every ${rules.timezone.changeCooldownDays} days.`);
      }
      db.transaction(() => {
        users.updateTimezone({ id, timezone: normalized, changedAt: now.toISOString() });
        const skippedDates = [];
        for (let date = shiftDate(oldLocalDate, rules.units.one); date < newLocalDate; date = shiftDate(date, rules.units.one)) skippedDates.push(date);
        timezoneChanges.insert({ userId: id, changedAt: now.toISOString(), oldTimezone: current.timezone, newTimezone: normalized,
          oldLocalDate, newLocalDate, skippedDates });
        const date = newLocalDate;
        gameEngine?.enqueue({ eventType: 'TIMEZONE_CHANGED', userId: id, occurredAt: now.toISOString(), localDate: date, timezone: normalized,
          data: { previousTimezone: current.timezone, timezone: normalized, oldTimezone: current.timezone, newTimezone: normalized,
            oldLocalDate, newLocalDate, skippedDates } });
      })();
      if (gameEngine) { try { gameEngine.processUser(id); } catch { /* timezone changes remain successful after commit */ } }
      return publicUser(users.findById(id));
    },
  };
}
