import type { NestExpressApplication } from '@nestjs/platform-express';
import type { UserDto } from '@notch/shared';
import { expect } from 'vitest';
import { PrismaService } from '../../src/prisma/prisma.service.js';
import { TestClient } from './test-client.js';

export const INVITE_CODE = 'test-invite-code';
export const PASSWORD = 'correct horse battery';

/** Empties every table. Users cascade to everything they own. */
export async function resetDb(app: NestExpressApplication): Promise<void> {
  await app.get(PrismaService).$executeRaw`TRUNCATE "User" CASCADE`;
}

/** A fresh browser that has registered (and so is logged in) as `username`. */
export async function registerUser(
  app: NestExpressApplication,
  username = 'alice',
  extra: Record<string, unknown> = {},
): Promise<{ client: TestClient; user: UserDto }> {
  const client = await new TestClient(app.getHttpServer()).csrf();
  const res = await client.post('/auth/register', {
    username,
    password: PASSWORD,
    inviteCode: INVITE_CODE,
    timezone: 'Asia/Baku',
    ...extra,
  });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return { client, user: res.body as UserDto };
}

/** A fresh browser logged in as an existing user. */
export async function loginAs(
  app: NestExpressApplication,
  username: string,
  password = PASSWORD,
): Promise<TestClient> {
  const client = await new TestClient(app.getHttpServer()).csrf();
  const res = await client.post('/auth/login', { username, password });
  expect(res.status, JSON.stringify(res.body)).toBe(200);
  return client;
}
