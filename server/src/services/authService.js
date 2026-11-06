import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import { AUTH_CONFIG, DUMMY_PASSWORD_HASH } from '../config/authConstants.js';
import { createUserRepository } from '../repositories/userRepository.js';
import { nowIso } from '../utils/dates.js';
import { httpError } from '../utils/httpError.js';

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

function createToken(userId, secret) {
  return jwt.sign({}, secret, {
    subject: String(userId),
    expiresIn: AUTH_CONFIG.tokenTtlSeconds,
    algorithm: 'HS256',
  });
}

function isUniqueEmailError(error) {
  return error.code === 'SQLITE_CONSTRAINT_UNIQUE' || error.code === 'SQLITE_CONSTRAINT_PRIMARYKEY';
}

export function createAuthService({ db, secret }) {
  const users = createUserRepository(db);

  return {
    async register({ email, password, displayName, timezone }) {
      if (users.findByEmail(email)) {
        throw httpError(409, 'EMAIL_TAKEN', 'An account with this email already exists.');
      }

      const passwordHash = await argon2.hash(password, AUTH_CONFIG.argon2Options);
      const createdAt = nowIso();
      let user;
      try {
        user = users.create({
          email,
          passwordHash,
          displayName,
          timezone: resolveTimezone(timezone),
          createdAt,
        });
      } catch (error) {
        if (isUniqueEmailError(error)) {
          throw httpError(409, 'EMAIL_TAKEN', 'An account with this email already exists.');
        }
        throw error;
      }

      // future: emit USER_REGISTERED event
      return { user: publicUser(user), token: createToken(user.id, secret) };
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

      return { user: publicUser(user), token: createToken(user.id, secret) };
    },

    findPublicUserById(id) {
      const user = users.findById(id);
      return user ? publicUser(user) : null;
    },
  };
}
