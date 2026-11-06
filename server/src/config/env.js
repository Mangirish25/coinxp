import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const repositoryEnvPath = path.join(repositoryRoot, '.env');
dotenv.config({ path: repositoryEnvPath });

const required = ['PORT', 'NODE_ENV', 'DB_PATH', 'JWT_SECRET', 'CLIENT_ORIGIN'];

export function loadEnv(source = process.env) {
  const missing = required.filter((key) => !source[key]?.trim());
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
  try {
    new URL(source.CLIENT_ORIGIN);
  } catch {
    throw new Error('CLIENT_ORIGIN must be a valid origin URL.');
  }

  return {
    port,
    nodeEnv: source.NODE_ENV,
    dbPath:
      source.DB_PATH === ':memory:' ? ':memory:' : path.resolve(repositoryRoot, source.DB_PATH),
    jwtSecret: source.JWT_SECRET,
    clientOrigin: source.CLIENT_ORIGIN,
    authRateLimits: undefined,
  };
}
