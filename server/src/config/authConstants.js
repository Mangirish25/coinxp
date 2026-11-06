import argon2 from 'argon2';

export const AUTH_CONFIG = Object.freeze({
  cookieName: 'coinxp_auth',
  tokenTtlSeconds: 7 * 24 * 60 * 60,
  cookieMaxAgeMs: 7 * 24 * 60 * 60 * 1000,
  passwordMinLength: 8,
  passwordMaxLength: 128,
  displayNameMinLength: 2,
  displayNameMaxLength: 40,
  timezoneMaxLength: 100,
  argon2Options: Object.freeze({
    type: argon2.argon2id,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  }),
  loginRateLimit: Object.freeze({ windowMs: 15 * 60 * 1000, max: 10 }),
  registerRateLimit: Object.freeze({ windowMs: 15 * 60 * 1000, max: 10 }),
  defaultTimezone: 'Asia/Kolkata',
});

export const DUMMY_PASSWORD_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$sNyBp4FDIvrRrDjcA0nqww$0nJVzjBscDQBcM2qgmhDgQs05IC3d/rvjtHbruaYsxI';
