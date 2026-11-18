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

  it('requires explicit production origin and proxy configuration', () => {
    const prod = { ...base, NODE_ENV: 'production', JWT_SECRET: 'a'.repeat(40) };
    expect(() => loadEnv(prod)).toThrow('PUBLIC_ORIGIN, TRUST_PROXY');
    expect(loadEnv({ ...prod, PUBLIC_ORIGIN: 'https://coinxp.example', TRUST_PROXY: '1' })).toMatchObject({
      publicOrigin: 'https://coinxp.example', trustProxy: 1,
    });
    expect(() => loadEnv({ ...prod, PUBLIC_ORIGIN: 'https://coinxp.example', TRUST_PROXY: '1', ENABLE_TEST_CLOCK: '1' }))
      .toThrow('ENABLE_TEST_CLOCK cannot be enabled in production.');
  });
});
