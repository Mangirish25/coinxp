import { describe, expect, it } from 'vitest';
import { loadEnv } from './env.js';

const base = {
  PORT: '3001',
  NODE_ENV: 'development',
  DB_PATH: ':memory:',
  JWT_SECRET: 'development-secret',
  CLIENT_ORIGIN: 'http://localhost:5173',
};

describe('environment validation', () => {
  it('requires a 32-character JWT secret in production', () => {
    expect(() => loadEnv({ ...base, NODE_ENV: 'production', JWT_SECRET: 'short' })).toThrow(
      'JWT_SECRET must be at least 32 characters in production.',
    );
  });

  it('accepts the development secret and keeps in-memory database paths', () => {
    expect(loadEnv(base)).toMatchObject({ nodeEnv: 'development', dbPath: ':memory:' });
  });
});
