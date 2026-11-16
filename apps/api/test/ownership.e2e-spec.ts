import type { NestExpressApplication } from '@nestjs/platform-express';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp } from './create-test-app.js';
import { PASSWORD, registerUser, resetDb } from './helpers/auth.js';
import { createCore, createGoal } from './helpers/structure.js';
import type { TestClient } from './helpers/test-client.js';

interface AliceIds {
  core: string;
  goal: string;
  milestone: string;
  bobCore: string;
  bobGoal: string;
}

type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';

/**
 * Every route that takes an id, called by Bob with Alice's ids: always 404, never 403, and Alice's
 * data doesn't change. Later sprints add their routes here.
 */
const ROUTES: [Method, (ids: AliceIds) => string, (ids: AliceIds) => object | undefined, string][] =
  [
    ['patch', (ids) => `/cores/${ids.core}`, () => ({ name: 'Mine now' }), 'CORE_NOT_FOUND'],
    ['put', () => '/cores/order', (ids) => ({ ids: [ids.core] }), 'CORE_NOT_FOUND'],
    ['post', (ids) => `/cores/${ids.core}/archive`, () => undefined, 'CORE_NOT_FOUND'],
    ['post', (ids) => `/cores/${ids.core}/unarchive`, () => undefined, 'CORE_NOT_FOUND'],
    ['delete', (ids) => `/cores/${ids.core}`, () => undefined, 'CORE_NOT_FOUND'],
    ['post', () => '/goals', (ids) => ({ coreId: ids.core, title: 'X' }), 'CORE_NOT_FOUND'],
    ['patch', (ids) => `/goals/${ids.bobGoal}`, (ids) => ({ coreId: ids.core }), 'CORE_NOT_FOUND'],
    ['get', (ids) => `/goals/${ids.goal}`, () => undefined, 'GOAL_NOT_FOUND'],
    ['patch', (ids) => `/goals/${ids.goal}`, () => ({ title: 'Mine now' }), 'GOAL_NOT_FOUND'],
    ['post', (ids) => `/goals/${ids.goal}/complete`, () => undefined, 'GOAL_NOT_FOUND'],
    ['post', (ids) => `/goals/${ids.goal}/reopen`, () => undefined, 'GOAL_NOT_FOUND'],
    ['post', (ids) => `/goals/${ids.goal}/archive`, () => undefined, 'GOAL_NOT_FOUND'],
    ['post', (ids) => `/goals/${ids.goal}/unarchive`, () => undefined, 'GOAL_NOT_FOUND'],
    ['delete', (ids) => `/goals/${ids.goal}`, () => undefined, 'GOAL_NOT_FOUND'],
    ['post', (ids) => `/goals/${ids.goal}/milestones`, () => ({ title: 'X' }), 'GOAL_NOT_FOUND'],
    [
      'put',
      (ids) => `/goals/${ids.goal}/milestones/order`,
      (ids) => ({ ids: [ids.milestone] }),
      'GOAL_NOT_FOUND',
    ],
    [
      'patch',
      (ids) => `/milestones/${ids.milestone}`,
      () => ({ title: 'X' }),
      'MILESTONE_NOT_FOUND',
    ],
    [
      'post',
      (ids) => `/milestones/${ids.milestone}/toggle`,
      () => undefined,
      'MILESTONE_NOT_FOUND',
    ],
    ['delete', (ids) => `/milestones/${ids.milestone}`, () => undefined, 'MILESTONE_NOT_FOUND'],
  ];

describe('ownership (e2e)', () => {
  let app: NestExpressApplication;
  let alice: TestClient;
  let bob: TestClient;
  let ids: AliceIds;
  let snapshot: () => Promise<unknown>;

  beforeAll(async () => {
    app = await createTestApp();
    await resetDb(app);
    ({ client: alice } = await registerUser(app, 'alice'));
    ({ client: bob } = await registerUser(app, 'bob'));

    const core = await createCore(alice);
    const goal = await createGoal(alice, core.id, { milestones: ['one'] });
    const bobCore = await createCore(bob);
    const bobGoal = await createGoal(bob, bobCore.id);
    ids = {
      core: core.id,
      goal: goal.id,
      milestone: goal.milestones[0]!.id,
      bobCore: bobCore.id,
      bobGoal: bobGoal.id,
    };

    snapshot = async () => ({
      cores: (await alice.get('/cores?includeArchived=true')).body,
      goal: (await alice.get(`/goals/${ids.goal}`)).body,
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it.each(ROUTES)('%s %s → 404', async (method, path, body, code) => {
    const before = await snapshot();
    const res = await bob[method](path(ids), body(ids));
    expect(res.status).toBe(404);
    expect(res.body.code).toBe(code);
    expect(await snapshot()).toEqual(before);
  });

  it("lists never include another user's records", async () => {
    expect((await bob.get(`/goals?coreId=${ids.core}`)).body).toEqual([]);
    const bobCores = (await bob.get('/cores?includeArchived=true')).body;
    expect(bobCores.map((core: { id: string }) => core.id)).toEqual([ids.bobCore]);
  });

  it('deleting an account removes everything it owns, and nothing else', async () => {
    const prisma = app.get(PrismaService);
    const res = await alice.delete('/me', { password: PASSWORD });
    expect(res.status).toBe(204);
    expect(await prisma.core.count({ where: { id: ids.core } })).toBe(0);
    expect(await prisma.goal.count({ where: { id: ids.goal } })).toBe(0);
    expect(await prisma.milestone.count()).toBe(0);
    expect(await prisma.goal.count({ where: { id: ids.bobGoal } })).toBe(1);
  });
});
