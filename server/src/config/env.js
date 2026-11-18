import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const repositoryEnvPath = path.join(repositoryRoot, '.env');
dotenv.config({ path: repositoryEnvPath });

const required = ['PORT', 'NODE_ENV', 'DB_PATH', 'JWT_SECRET', 'CLIENT_ORIGIN'];

export function loadEnv(source = process.env) {
  if (source.NODE_ENV === 'production' && source.JWT_SECRET && source.JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters in production.');
  }
  const requiredVars = [...required];
  if (source.NODE_ENV === 'production') requiredVars.push('PUBLIC_ORIGIN', 'TRUST_PROXY');
  const missing = requiredVars.filter((key) => !source[key]?.trim());
  if (missing.length) {
    throw new Error(
      `Missing required environment variable(s): ${missing.join(', ')}. Copy .env.example to .env and provide values.`,
    );
  }

  const port = Number(source.PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535.');
  }
  if (!['development', 'test', 'production'].includes(source.NODE_ENV)) {
    throw new Error('NODE_ENV must be development, test, or production.');
  }
  if (source.NODE_ENV === 'production' && source.JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters in production.');
  }
  if (source.NODE_ENV === 'production' && source.ENABLE_TEST_CLOCK === '1') {
    throw new Error('ENABLE_TEST_CLOCK cannot be enabled in production.');
  }
  try {
    new URL(source.CLIENT_ORIGIN);
  } catch {
    throw new Error('CLIENT_ORIGIN must be a valid origin URL.');
  }
  const publicOrigin = source.PUBLIC_ORIGIN?.trim() || source.CLIENT_ORIGIN;
  try {
    const parsed = new URL(publicOrigin);
    if (parsed.origin !== publicOrigin) throw new Error();
  } catch {
    throw new Error('PUBLIC_ORIGIN must be a valid origin URL without a path.');
  }
  const trustProxyRaw = source.TRUST_PROXY?.trim();
  const trustProxy = trustProxyRaw === undefined || trustProxyRaw === '' ? false
    : trustProxyRaw === 'true' ? true
      : trustProxyRaw === 'false' ? false
        : /^\d+$/.test(trustProxyRaw) ? Number(trustProxyRaw)
          : trustProxyRaw.split(',').map((item) => item.trim()).filter(Boolean);
  if (source.NODE_ENV === 'production' && (trustProxy === false || (Array.isArray(trustProxy) && !trustProxy.length))) {
    throw new Error('TRUST_PROXY must explicitly identify trusted proxy hops in production.');
  }

  return {
    port,
    nodeEnv: source.NODE_ENV,
    dbPath:
      source.DB_PATH === ':memory:' ? ':memory:' : path.resolve(repositoryRoot, source.DB_PATH),
    jwtSecret: source.JWT_SECRET,
    clientOrigin: source.CLIENT_ORIGIN,
    publicOrigin,
    trustProxy,
    opsHealthToken: source.OPS_HEALTH_TOKEN || null,
    enableTestClock: source.ENABLE_TEST_CLOCK === '1',
    schedulerEnabled: source.SCHEDULER_ENABLED !== 'false',
    authRateLimits: undefined,
    gamificationEnabled: source.GAMIFICATION_ENABLED !== 'false',
  };
}
