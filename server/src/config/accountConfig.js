export const ACCOUNT_CONFIG = Object.freeze({
  deletionGraceDays: 30,
  deletionRateLimit: Object.freeze({ windowMs: 24 * 60 * 60 * 1000, max: 3 }),
});
