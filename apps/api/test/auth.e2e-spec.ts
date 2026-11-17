import type { NestExpressApplication } from '@nestjs/platform-express';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sha256 } from '../src/auth/tokens.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp } from './create-test-app.js';
import { INVITE_CODE, loginAs, PASSWORD, registerUser, resetDb } from './helpers/auth.js';
import { setCookieNames, TestClient } from './helpers/test-client.js';

const DAY_MS = 24 * 60 * 60 * 1000;

describe('auth (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;

  const newClient = () => new TestClient(app.getHttpServer());
  const sessionOf = (client: TestClient) =>
    prisma.session.findUniqueOrThrow({
      where: { tokenHash: sha256(client.cookies.get('SESSION')!) },
    });

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
  });

  beforeEach(async () => {
    await resetDb(app);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('GET /auth/csrf', () => {
    it('sets a readable XSRF-TOKEN cookie and returns 204', async () => {
      const res = await newClient().get('/auth/csrf');
      expect(res.status).toBe(204);
      const cookie = [res.headers['set-cookie'] ?? []].flat().join('\n');
      expect(cookie).toMatch(/XSRF-TOKEN=[^;]+; Max-Age=2592000;.*Path=\/;.*SameSite=Lax/);
      expect(cookie).not.toMatch(/HttpOnly/);
    });
  });

  describe('POST /auth/register', () => {
    const body = (extra: Record<string, unknown> = {}) => ({
      username: 'alice',
      password: PASSWORD,
      inviteCode: INVITE_CODE,
      timezone: 'Asia/Baku',
      ...extra,
    });

    it('creates the user, starts a session and rotates the CSRF token', async () => {
      const client = await newClient().csrf();
      const anonToken = client.cookies.get('XSRF-TOKEN');

      const res = await client.post(
        '/auth/register',
        body({ username: '  Alice ', name: 'Alice' }),
      );

      expect(res.status).toBe(201);
      expect(res.body).toEqual({
        id: expect.any(String),
        username: 'alice',
        name: 'Alice',
        timezone: 'Asia/Baku',
        onboardedAt: null,
      });
      const session = [res.headers['set-cookie'] ?? []]
        .flat()
        .find((c) => c.startsWith('SESSION='));
      expect(session).toMatch(/HttpOnly/);
      expect(session).toMatch(/SameSite=Lax/);
      expect(client.cookies.get('XSRF-TOKEN')).not.toBe(anonToken);

      const me = await client.get('/auth/me');
      expect(me.status).toBe(200);
      expect(me.body.username).toBe('alice');
    });

    it('stores only the hash of the session token', async () => {
      const { client } = await registerUser(app);
      const token = client.cookies.get('SESSION')!;
      expect(await prisma.session.count({ where: { tokenHash: token } })).toBe(0);
      expect(await prisma.session.count({ where: { tokenHash: sha256(token) } })).toBe(1);
    });

    it('rejects a wrong invite code with 403 INVALID_INVITE_CODE', async () => {
      const client = await newClient().csrf();
      const res = await client.post('/auth/register', body({ inviteCode: 'nope' }));
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('INVALID_INVITE_CODE');
      expect(await prisma.user.count()).toBe(0);
    });

    it('closes registration at MAX_USERS (3 in tests)', async () => {
      for (const username of ['alice', 'bob', 'carol']) {
        await registerUser(app, username);
      }
      const client = await newClient().csrf();
      const res = await client.post('/auth/register', body({ username: 'dave' }));
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('REGISTRATION_CLOSED');
    });

    it('treats usernames case-insensitively: Alice after alice is taken', async () => {
      await registerUser(app, 'alice');
      const client = await newClient().csrf();
      const res = await client.post('/auth/register', body({ username: 'Alice' }));
      expect(res.status).toBe(409);
      expect(res.body).toMatchObject({ code: 'USERNAME_TAKEN', details: { field: 'username' } });
    });

    it('validates the body', async () => {
      const client = await newClient().csrf();
      const res = await client.post(
        '/auth/register',
        body({ username: 'a b', password: 'short', timezone: 'Mars/Base' }),
      );
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('VALIDATION_FAILED');
      const paths = (res.body.details.issues as { path: string }[]).map((issue) => issue.path);
      expect(paths).toEqual(expect.arrayContaining(['username', 'password', 'timezone']));
    });
  });

  describe('POST /auth/login', () => {
    beforeEach(async () => {
      await registerUser(app, 'alice');
    });

    it('logs in, case-insensitively, and returns the user', async () => {
      const client = await newClient().csrf();
      const res = await client.post('/auth/login', { username: ' ALICE ', password: PASSWORD });
      expect(res.status).toBe(200);
      expect(res.body.username).toBe('alice');
      expect((await client.get('/auth/me')).status).toBe(200);
    });

    it('gives the same 401 for an unknown user and a wrong password', async () => {
      const client = await newClient().csrf();
      const unknown = await client.post('/auth/login', { username: 'nobody', password: PASSWORD });
      const wrong = await client.post('/auth/login', {
        username: 'alice',
        password: 'wrong password',
      });
      expect(unknown.status).toBe(401);
      expect(wrong.status).toBe(401);
      expect(unknown.body).toEqual(wrong.body);
      expect(unknown.body).toEqual({
        statusCode: 401,
        code: 'INVALID_CREDENTIALS',
        message: 'Invalid username or password',
      });
    });

    it('issues a new session token on every login (no fixation) and ends the old one', async () => {
      const client = await loginAs(app, 'alice');
      const first = client.cookies.get('SESSION');
      await client.post('/auth/login', { username: 'alice', password: PASSWORD });
      expect(client.cookies.get('SESSION')).not.toBe(first);
      expect(await prisma.session.count({ where: { tokenHash: sha256(first!) } })).toBe(0);
    });

    it('deletes the user’s expired sessions', async () => {
      const old = await loginAs(app, 'alice');
      await prisma.session.updateMany({
        where: { tokenHash: sha256(old.cookies.get('SESSION')!) },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      await loginAs(app, 'alice');
      expect(await prisma.session.count({ where: { expiresAt: { lte: new Date() } } })).toBe(0);
    });

    it('throttles after 10 attempts per minute from one IP, but not other IPs', async () => {
      const client = await newClient().csrf();
      for (let attempt = 1; attempt <= 10; attempt += 1) {
        const res = await client.post('/auth/login', {
          username: 'alice',
          password: 'wrong password',
        });
        expect(res.status).toBe(401);
      }
      const blocked = await client.post('/auth/login', { username: 'alice', password: PASSWORD });
      expect(blocked.status).toBe(429);
      expect(blocked.body.code).toBe('TOO_MANY_REQUESTS');

      const other = await newClient().csrf();
      expect(
        (await other.post('/auth/login', { username: 'alice', password: PASSWORD })).status,
      ).toBe(200);
    });
  });

  describe('CSRF', () => {
    it('rejects an unsafe request without the header', async () => {
      const client = await newClient().csrf();
      const res = await client.post(
        '/auth/login',
        { username: 'a', password: 'b' },
        { csrf: false },
      );
      expect(res.status).toBe(403);
      expect(res.body).toEqual({
        statusCode: 403,
        code: 'CSRF_INVALID',
        message: 'Invalid or missing CSRF token',
      });
    });

    it('rejects a header that differs from the cookie', async () => {
      const client = await newClient().csrf();
      const other = await newClient().csrf();
      const res = await client.post(
        '/auth/login',
        { username: 'a', password: 'b' },
        { csrf: other.cookies.get('XSRF-TOKEN')! },
      );
      expect(res.status).toBe(403);
    });

    it('rejects a forged token even when header and cookie match', async () => {
      const client = newClient();
      client.cookies.set('XSRF-TOKEN', 'forged.signature');
      const res = await client.post('/auth/login', { username: 'a', password: 'b' });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('CSRF_INVALID');
    });

    it('rejects the token from before login once logged in', async () => {
      const client = await newClient().csrf();
      const anonToken = client.cookies.get('XSRF-TOKEN')!;
      await registerUser(app, 'alice');
      await client.post('/auth/login', { username: 'alice', password: PASSWORD });

      client.cookies.set('XSRF-TOKEN', anonToken);
      const res = await client.post('/auth/logout-all');
      expect(res.status).toBe(403);
    });

    it('lets GET requests through without a token', async () => {
      const { client } = await registerUser(app);
      client.cookies.delete('XSRF-TOKEN');
      expect((await client.get('/auth/me')).status).toBe(200);
    });
  });

  describe('sessions', () => {
    it('returns 401 UNAUTHENTICATED without a session', async () => {
      const res = await newClient().get('/auth/me');
      expect(res.status).toBe(401);
      expect(res.body.code).toBe('UNAUTHENTICATED');
    });

    it('returns 401 for an unknown session token', async () => {
      const client = newClient();
      client.cookies.set('SESSION', 'made-up');
      expect((await client.get('/auth/me')).status).toBe(401);
    });

    it('returns 401 for an expired session', async () => {
      const { client } = await registerUser(app);
      const session = await sessionOf(client);
      await prisma.session.update({
        where: { id: session.id },
        data: { expiresAt: new Date(Date.now() - 1000) },
      });
      expect((await client.get('/auth/me')).status).toBe(401);
    });

    it('extends the session at most once a day', async () => {
      const { client } = await registerUser(app);

      const fresh = await client.get('/auth/me');
      expect(setCookieNames(fresh)).not.toContain('SESSION');

      const session = await sessionOf(client);
      await prisma.session.update({
        where: { id: session.id },
        data: {
          lastSeenAt: new Date(Date.now() - 2 * DAY_MS),
          expiresAt: new Date(Date.now() + DAY_MS),
        },
      });
      const stale = await client.get('/auth/me');
      expect(setCookieNames(stale)).toEqual(expect.arrayContaining(['SESSION', 'XSRF-TOKEN']));
      const extended = await sessionOf(client);
      expect(extended.expiresAt.getTime()).toBeGreaterThan(Date.now() + 29 * DAY_MS);

      // The re-issued CSRF token works.
      expect((await client.post('/auth/logout')).status).toBe(204);
    });

    it('logout deletes the session and clears the cookie', async () => {
      const { client } = await registerUser(app);
      const token = client.cookies.get('SESSION')!;

      const res = await client.post('/auth/logout');
      expect(res.status).toBe(204);
      expect(client.cookies.has('SESSION')).toBe(false);
      expect(client.cookies.has('XSRF-TOKEN')).toBe(true);
      expect(await prisma.session.count()).toBe(0);

      client.cookies.set('SESSION', token);
      expect((await client.get('/auth/me')).status).toBe(401);
    });

    it('logout still clears cookies when the session already expired', async () => {
      const { client } = await registerUser(app);
      await prisma.session.deleteMany();
      expect((await client.post('/auth/logout')).status).toBe(204);
      expect(client.cookies.has('SESSION')).toBe(false);
    });

    it('logout-all ends every session of the user, and only theirs', async () => {
      const { client: laptop } = await registerUser(app, 'alice');
      const phone = await loginAs(app, 'alice');
      const { client: bob } = await registerUser(app, 'bob');

      expect((await laptop.post('/auth/logout-all')).status).toBe(204);
      expect((await laptop.get('/auth/me')).status).toBe(401);
      expect((await phone.get('/auth/me')).status).toBe(401);
      expect((await bob.get('/auth/me')).status).toBe(200);
    });

    it('survives an API restart', async () => {
      const { client } = await registerUser(app);
      await app.close();
      app = await createTestApp();
      prisma = app.get(PrismaService);

      const res = await client.withApp(app).get('/auth/me');
      expect(res.status).toBe(200);
      expect(res.body.username).toBe('alice');
      expect((await client.post('/auth/logout')).status).toBe(204);
    });
  });
});
