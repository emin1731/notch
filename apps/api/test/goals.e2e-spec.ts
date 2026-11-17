import type { NestExpressApplication } from '@nestjs/platform-express';
import type { CoreDto, GoalDto } from '@notch/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { createTestApp } from './create-test-app.js';
import { registerUser, resetDb } from './helpers/auth.js';
import { createCore, createGoal } from './helpers/structure.js';
import type { TestClient } from './helpers/test-client.js';

describe('goals (e2e)', () => {
  let app: NestExpressApplication;
  let client: TestClient;
  let core: CoreDto;

  beforeAll(async () => {
    app = await createTestApp();
  });

  beforeEach(async () => {
    await resetDb(app);
    ({ client } = await registerUser(app));
    core = await createCore(client);
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates a goal with inline milestones and returns the detail', async () => {
    const goal = await createGoal(client, core.id, {
      description: 'Under 4 hours',
      deadline: '2027-04-01',
      milestones: ['5k', '10k', 'Half marathon'],
    });
    expect(goal).toMatchObject({
      coreId: core.id,
      title: 'Run a marathon',
      description: 'Under 4 hours',
      deadline: '2027-04-01',
      status: 'ACTIVE',
      completedAt: null,
      archivedAt: null,
      progress: 0,
      milestoneCounts: { done: 0, total: 3 },
    });
    expect(goal.milestones.map((m) => [m.title, m.sortOrder])).toEqual([
      ['5k', 0],
      ['10k', 1],
      ['Half marathon', 2],
    ]);
    expect((await client.get(`/goals/${goal.id}`)).body).toEqual(goal);
  });

  it('a goal without milestones has no progress', async () => {
    const goal = await createGoal(client, core.id);
    expect(goal).toMatchObject({ progress: null, milestoneCounts: { done: 0, total: 0 } });
  });

  it('lists with progress and filters by core, status and archive', async () => {
    const other = await createCore(client, { name: 'Career' });
    const a = await createGoal(client, core.id, { title: 'A', milestones: ['x', 'y'] });
    await client.post(`/milestones/${a.milestones[0]!.id}/toggle`);
    const b = await createGoal(client, other.id, { title: 'B' });
    await client.post(`/goals/${b.id}/complete`);
    const c = await createGoal(client, core.id, { title: 'C' });
    await client.post(`/goals/${c.id}/archive`);

    const titles = async (query: string) =>
      ((await client.get(`/goals${query}`)).body as GoalDto[]).map((goal) => goal.title);

    const all = (await client.get('/goals')).body as GoalDto[];
    expect(all.map((goal) => [goal.title, goal.progress])).toEqual([
      ['A', 0.5],
      ['B', null],
    ]);
    expect(await titles(`?coreId=${core.id}`)).toEqual(['A']);
    expect(await titles('?status=COMPLETED')).toEqual(['B']);
    expect(await titles('?includeArchived=true')).toEqual(['A', 'B', 'C']);
    expect((await client.get('/goals?status=ARCHIVED')).status).toBe(400);
  });

  describe('create', () => {
    it('needs an owned core', async () => {
      const res = await client.post('/goals', {
        coreId: crypto.randomUUID(),
        title: 'X',
      });
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('CORE_NOT_FOUND');
    });

    it('refuses an archived core', async () => {
      await client.post(`/cores/${core.id}/archive`);
      const res = await client.post('/goals', { coreId: core.id, title: 'X' });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('CORE_ARCHIVED');
    });

    it('validates the deadline and caps inline milestones at 50', async () => {
      expect(
        (await client.post('/goals', { coreId: core.id, title: 'X', deadline: '2027-02-30' }))
          .status,
      ).toBe(400);
      const many = Array.from({ length: 51 }, (_, n) => `m${n}`);
      expect(
        (await client.post('/goals', { coreId: core.id, title: 'X', milestones: many })).status,
      ).toBe(400);
    });
  });

  describe('update', () => {
    it('updates fields and clears them with null', async () => {
      const goal = await createGoal(client, core.id, { description: 'd', deadline: '2027-01-01' });
      const res = await client.patch(`/goals/${goal.id}`, {
        title: 'New',
        description: null,
        deadline: null,
      });
      expect(res.status).toBe(200);
      expect(res.body).toMatchObject({ title: 'New', description: null, deadline: null });
    });

    it('moves the goal to another owned, active core', async () => {
      const goal = await createGoal(client, core.id);
      const other = await createCore(client, { name: 'Career' });
      expect((await client.patch(`/goals/${goal.id}`, { coreId: other.id })).body.coreId).toBe(
        other.id,
      );

      await client.post(`/cores/${core.id}/archive`);
      const toArchived = await client.patch(`/goals/${goal.id}`, { coreId: core.id });
      expect(toArchived.status).toBe(409);
      expect(toArchived.body.code).toBe('CORE_ARCHIVED');

      const toUnknown = await client.patch(`/goals/${goal.id}`, { coreId: crypto.randomUUID() });
      expect(toUnknown.status).toBe(404);
    });
  });

  describe('complete and reopen', () => {
    it('works for a goal without milestones', async () => {
      const goal = await createGoal(client, core.id);
      const done = await client.post(`/goals/${goal.id}/complete`);
      expect(done.status).toBe(200);
      expect(done.body).toMatchObject({ status: 'COMPLETED', completedAt: expect.any(String) });

      const again = await client.post(`/goals/${goal.id}/complete`);
      expect(again.body.completedAt).toBe(done.body.completedAt);

      const reopened = await client.post(`/goals/${goal.id}/reopen`);
      expect(reopened.body).toMatchObject({ status: 'ACTIVE', completedAt: null });
    });

    it('is refused for a goal with milestones', async () => {
      const goal = await createGoal(client, core.id, { milestones: ['one'] });
      const res = await client.post(`/goals/${goal.id}/complete`);
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('GOAL_HAS_MILESTONES');
      expect((await client.post(`/goals/${goal.id}/reopen`)).status).toBe(409);
    });
  });

  describe('archive', () => {
    it('keeps the status of a completed goal', async () => {
      const goal = await createGoal(client, core.id);
      await client.post(`/goals/${goal.id}/complete`);
      const archived = await client.post(`/goals/${goal.id}/archive`);
      expect(archived.body).toMatchObject({ status: 'COMPLETED', archivedAt: expect.any(String) });

      const restored = await client.post(`/goals/${goal.id}/unarchive`);
      expect(restored.body).toMatchObject({ status: 'COMPLETED', archivedAt: null });
    });

    it('refuses to unarchive while the core is archived', async () => {
      const goal = await createGoal(client, core.id);
      await client.post(`/cores/${core.id}/archive`);
      const res = await client.post(`/goals/${goal.id}/unarchive`);
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('CORE_ARCHIVED');

      await client.post(`/cores/${core.id}/unarchive`);
      expect((await client.post(`/goals/${goal.id}/unarchive`)).body.archivedAt).toBeNull();
    });
  });

  it('delete removes the goal and its milestones', async () => {
    const goal = await createGoal(client, core.id, { milestones: ['a', 'b'] });
    expect((await client.delete(`/goals/${goal.id}`)).status).toBe(204);
    expect((await client.get(`/goals/${goal.id}`)).status).toBe(404);
    expect(await app.get(PrismaService).milestone.count()).toBe(0);
  });

  it('returns 404 GOAL_NOT_FOUND for a malformed or unknown id', async () => {
    expect((await client.get('/goals/123')).body.code).toBe('GOAL_NOT_FOUND');
    expect((await client.get(`/goals/${crypto.randomUUID()}`)).status).toBe(404);
  });
});
