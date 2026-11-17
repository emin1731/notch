import type { NestExpressApplication } from '@nestjs/platform-express';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { AuthService } from '../src/auth/auth.service.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp } from './create-test-app.js';
import { loginAs, PASSWORD, registerUser, resetDb } from './helpers/auth.js';
import { TestClient } from './helpers/test-client.js';

describe('users (e2e)', () => {
  let app: NestExpressApplication;
  let prisma: PrismaService;

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

  describe('PATCH /me', () => {
    it('updates the name and timezone', async () => {
      const { client } = await registerUser(app);
      const res = await client.patch('/me', { name: 'Alice', timezone: 'Europe/Berlin' });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ name: 'Alice', timezone: 'Europe/Berlin' });
      expect((await client.get('/auth/me')).body.timezone).toBe('Europe/Berlin');
    });

    it('clears the name with null', async () => {
      const { client } = await registerUser(app, 'alice', { name: 'Alice' });
      expect((await client.patch('/me', { name: null })).body.name).toBeNull();
    });

    it('rejects an unknown timezone and an empty update', async () => {
      const { client } = await registerUser(app);
      expect((await client.patch('/me', { timezone: 'Mars/Base' })).body.code).toBe(
        'VALIDATION_FAILED',
      );
      expect((await client.patch('/me', {})).status).toBe(400);
    });

    it('requires a session and a CSRF token', async () => {
      expect((await new TestClient(app.getHttpServer()).patch('/me', { name: 'x' })).status).toBe(
        401,
      );
      const { client } = await registerUser(app);
      expect((await client.patch('/me', { name: 'x' }, { csrf: false })).status).toBe(403);
    });
  });

  describe('POST /me/password', () => {
    const NEW_PASSWORD = 'a much better passphrase';

    it('rejects a wrong current password with 403, keeping the session', async () => {
      const { client } = await registerUser(app);
      const res = await client.post('/me/password', {
        currentPassword: 'wrong password',
        newPassword: NEW_PASSWORD,
      });
      expect(res.status).toBe(403);
      expect(res.body.code).toBe('INVALID_CREDENTIALS');
      expect((await client.get('/auth/me')).status).toBe(200);
    });

    it('changes the password and ends every other session', async () => {
      const { client: laptop } = await registerUser(app);
      const phone = await loginAs(app, 'alice');

      const res = await laptop.post('/me/password', {
        currentPassword: PASSWORD,
        newPassword: NEW_PASSWORD,
      });
      expect(res.status).toBe(204);
      expect((await laptop.get('/auth/me')).status).toBe(200);
      expect((await phone.get('/auth/me')).status).toBe(401);

      const fresh = await new TestClient(app.getHttpServer()).csrf();
      expect(
        (await fresh.post('/auth/login', { username: 'alice', password: PASSWORD })).status,
      ).toBe(401);
      await loginAs(app, 'alice', NEW_PASSWORD);
    });

    it('applies the password rules to the new password', async () => {
      const { client } = await registerUser(app);
      const res = await client.post('/me/password', {
        currentPassword: PASSWORD,
        newPassword: 'short',
      });
      expect(res.status).toBe(400);
    });
  });

  describe('POST /me/onboarding/complete', () => {
    it('sets onboardedAt once', async () => {
      const { client } = await registerUser(app);
      const first = await client.post('/me/onboarding/complete');
      expect(first.status).toBe(200);
      expect(first.body.onboardedAt).toEqual(expect.any(String));

      const second = await client.post('/me/onboarding/complete');
      expect(second.body.onboardedAt).toBe(first.body.onboardedAt);
    });
  });

  describe('DELETE /me', () => {
    it('rejects a wrong password with 403', async () => {
      const { client } = await registerUser(app);
      const res = await client.delete('/me', { password: 'wrong password' });
      expect(res.status).toBe(403);
      expect(await prisma.user.count()).toBe(1);
    });

    it('deletes the user and their sessions, and clears the cookie', async () => {
      const { client } = await registerUser(app);
      const phone = await loginAs(app, 'alice');
      const { client: bob } = await registerUser(app, 'bob');
      const token = client.cookies.get('SESSION')!;

      const res = await client.delete('/me', { password: PASSWORD });
      expect(res.status).toBe(204);
      expect(client.cookies.has('SESSION')).toBe(false);

      client.cookies.set('SESSION', token);
      expect((await client.get('/auth/me')).status).toBe(401);
      expect((await phone.get('/auth/me')).status).toBe(401);
      expect((await bob.get('/auth/me')).status).toBe(200);
      expect(await prisma.session.count()).toBe(1);

      const fresh = await new TestClient(app.getHttpServer()).csrf();
      expect(
        (await fresh.post('/auth/login', { username: 'alice', password: PASSWORD })).status,
      ).toBe(401);
    });
  });

  // What the user:create and user:set-password CLI scripts call.
  describe('AuthService (CLI operations)', () => {
    it('createUser ignores the invite code and MAX_USERS', async () => {
      for (const username of ['alice', 'bob', 'carol']) {
        await registerUser(app, username);
      }
      const user = await app
        .get(AuthService)
        .createUser({ username: 'dave', password: PASSWORD, timezone: 'UTC' });
      expect(user.username).toBe('dave');
      await loginAs(app, 'dave');
    });

    it('createUser refuses a taken username', async () => {
      await registerUser(app);
      await expect(
        app.get(AuthService).createUser({ username: 'alice', password: PASSWORD, timezone: 'UTC' }),
      ).rejects.toMatchObject({ body: { code: 'USERNAME_TAKEN' } });
    });

    it('setPassword replaces the password and ends every session', async () => {
      const { client } = await registerUser(app);
      await app.get(AuthService).setPassword('alice', 'reset by the admin');

      expect((await client.get('/auth/me')).status).toBe(401);
      await loginAs(app, 'alice', 'reset by the admin');
    });

    it('setPassword reports an unknown user', async () => {
      await expect(app.get(AuthService).setPassword('nobody', PASSWORD)).rejects.toMatchObject({
        body: { code: 'NOT_FOUND' },
      });
    });
  });
});
