import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import { createApp } from './app.js';
import { createDatabase } from './db/connection.js';
import { migrateDatabase } from './db/migrator.js';

const secret = 'test-only-secret-with-at-least-thirty-two-characters';
const registerBody = {
  email: '  Person@Example.com ',
  password: 'correct-horse-7',
  displayName: '  Sam User  ',
  timezone: 'Asia/Tokyo',
};

describe('authentication endpoints', () => {
  let db;
  let app;

  beforeEach(() => {
    db = createDatabase(':memory:');
    migrateDatabase(db);
    app = createApp({
      db,
      config: {
        clientOrigin: 'http://localhost:5173',
        nodeEnv: 'test',
        jwtSecret: secret,
      },
      logger: { info() {} },
    });
  });

  afterEach(() => db.close());

  function register(body = registerBody) {
    return request(app).post('/api/auth/register').send(body);
  }

  function cookieFrom(response) {
    return response.headers['set-cookie'][0].split(';')[0];
  }

  it('registers, creates an Argon2id hash, and returns only the public user', async () => {
    const response = await register().expect(201);
    expect(response.body).toEqual({
      id: expect.any(Number),
      email: 'person@example.com',
      displayName: 'Sam User',
      timezone: 'Asia/Tokyo',
      createdAt: expect.any(String),
    });
    expect(response.body).not.toHaveProperty('password_hash');
    expect(response.body).not.toHaveProperty('passwordHash');

    const cookie = response.headers['set-cookie'][0];
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Path=/');
    expect(cookie).not.toContain('Secure');
    expect(response.headers['access-control-allow-credentials']).toBe('true');
    expect(response.headers['access-control-allow-origin']).toBe('http://localhost:5173');

    const userRow = db
      .prepare('SELECT email, password_hash FROM users WHERE id = ?')
      .get(response.body.id);
    expect(userRow.email).toBe('person@example.com');
    expect(userRow.password_hash).toMatch(/^\$argon2id\$/);
    expect(userRow.password_hash).not.toBe(registerBody.password);
    await expect(argon2.verify(userRow.password_hash, registerBody.password)).resolves.toBe(true);
    const token = decodeURIComponent(
      cookie.split(';')[0].slice(cookie.split(';')[0].indexOf('=') + 1),
    );
    expect(Object.keys(jwt.decode(token)).sort()).toEqual(['exp', 'iat', 'sub']);
  });

  it('rejects duplicate email addresses regardless of casing', async () => {
    await register().expect(201);
    const response = await register({ ...registerBody, email: 'PERSON@example.COM' }).expect(409);
    expect(response.body.error.code).toBe('EMAIL_TAKEN');
    expect(response.body.error.message).toMatch(/already exists/i);
  });

  it('rejects weak passwords and invalid email with friendly messages', async () => {
    const weakPassword = await register({ ...registerBody, password: 'abc123' }).expect(400);
    expect(weakPassword.body.error.message).toBe('Password must be at least 8 characters.');

    const noNumber = await register({ ...registerBody, password: 'longpassword' }).expect(400);
    expect(noNumber.body.error.message).toBe('Password must contain at least one number.');

    const invalidEmail = await register({ ...registerBody, email: 'not-an-email' }).expect(400);
    expect(invalidEmail.body.error.message).toBe('Enter a valid email address.');
  });

  it('falls back to Asia/Kolkata when timezone is missing or invalid', async () => {
    const missing = await register({
      ...registerBody,
      email: 'missing@example.com',
      timezone: undefined,
    }).expect(201);
    const invalid = await register({
      ...registerBody,
      email: 'invalid@example.com',
      timezone: 'Mars/Olympus',
    }).expect(201);
    expect(missing.body.timezone).toBe('Asia/Kolkata');
    expect(invalid.body.timezone).toBe('Asia/Kolkata');
  });

  it('logs in and returns the public user with a session cookie', async () => {
    const registered = await register().expect(201);
    const response = await request(app)
      .post('/api/auth/login')
      .send({ email: ' PERSON@example.com ', password: registerBody.password })
      .expect(200);
    expect(response.body).toEqual(registered.body);
    expect(response.headers['set-cookie'][0]).toContain('HttpOnly');
  });

  it('uses the same failure status and shape for a wrong password and unknown email', async () => {
    await register().expect(201);
    const wrongPassword = await request(app)
      .post('/api/auth/login')
      .send({ email: 'person@example.com', password: 'incorrect-9' })
      .expect(401);
    const unknownEmail = await request(app)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: 'incorrect-9' })
      .expect(401);
    expect(wrongPassword.body).toEqual(unknownEmail.body);
    expect(wrongPassword.body).toEqual({
      error: { code: 'INVALID_CREDENTIALS', message: 'Invalid email or password' },
    });
  });

  it('restores /me with a cookie and rejects missing, tampered, expired, and deleted-user sessions', async () => {
    const registered = await register().expect(201);
    const cookie = cookieFrom(registered);
    await request(app).get('/api/auth/me').set('Cookie', cookie).expect(200, registered.body);
    await request(app)
      .get('/api/auth/me')
      .expect(401, {
        error: { code: 'UNAUTHENTICATED', message: 'Please sign in to continue.' },
      });

    const token = decodeURIComponent(cookie.slice(cookie.indexOf('=') + 1));
    const tampered = `${token.slice(0, -1)}${token.endsWith('a') ? 'b' : 'a'}`;
    await request(app).get('/api/auth/me').set('Cookie', `coinxp_auth=${tampered}`).expect(401);

    const expired = jwt.sign({}, secret, { subject: String(registered.body.id), expiresIn: -1 });
    await request(app).get('/api/auth/me').set('Cookie', `coinxp_auth=${expired}`).expect(401);

    db.prepare('DELETE FROM users WHERE id = ?').run(registered.body.id);
    await request(app).get('/api/auth/me').set('Cookie', cookie).expect(401);
  });

  it('clears the cookie on logout', async () => {
    const response = await request(app)
      .post('/api/auth/logout')
      .set('Content-Type', 'application/json')
      .send('{}')
      .expect(204);
    expect(response.headers['set-cookie'][0]).toMatch(/coinxp_auth=;/);
    expect(response.headers['set-cookie'][0]).toMatch(/HttpOnly/);
    expect(response.headers['set-cookie'][0]).toMatch(/Expires=Thu, 01 Jan 1970 00:00:00 GMT/);
  });

  it('limits login attempts and requires JSON on state-changing routes', async () => {
    const limitedApp = createApp({
      db,
      config: {
        clientOrigin: 'http://localhost:5173',
        nodeEnv: 'test',
        jwtSecret: secret,
        authRateLimits: {
          loginRateLimit: { windowMs: 60_000, max: 1 },
          registerRateLimit: { windowMs: 60_000, max: 10 },
        },
      },
      logger: { info() {} },
    });
    await request(limitedApp)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: 'abc12345' })
      .expect(401);
    await request(limitedApp)
      .post('/api/auth/login')
      .send({ email: 'nobody@example.com', password: 'abc12345' })
      .expect(429, {
        error: { code: 'RATE_LIMITED', message: 'Too many attempts. Please try again later.' },
      });
    await request(app)
      .post('/api/auth/logout')
      .expect(415, {
        error: { code: 'JSON_REQUIRED', message: 'Send this request as application/json.' },
      });
  });

  it('marks cookies Secure in production', async () => {
    const productionApp = createApp({
      db,
      config: { clientOrigin: 'https://coinxp.example', nodeEnv: 'production', jwtSecret: secret },
      logger: { info() {} },
    });
    const response = await request(productionApp)
      .post('/api/auth/register')
      .send({ ...registerBody, email: 'secure@example.com' })
      .expect(201);
    expect(response.headers['set-cookie'][0]).toContain('Secure');
  });
});
