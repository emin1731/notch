import type { NestExpressApplication } from '@nestjs/platform-express';
import type { GoalDetailDto } from '@notch/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from './create-test-app.js';
import { registerUser, resetDb } from './helpers/auth.js';
import { createCore, createGoal } from './helpers/structure.js';
import type { TestClient } from './helpers/test-client.js';

describe('milestones (e2e)', () => {
  let app: NestExpressApplication;
  let client: TestClient;
  let goal: GoalDetailDto;

  const ids = () => goal.milestones.map((milestone) => milestone.id);
  const toggle = (id: string) => client.post(`/milestones/${id}/toggle`);

  beforeAll(async () => {
    app = await createTestApp();
  });

  beforeEach(async () => {
    await resetDb(app);
    ({ client } = await registerUser(app));
    const core = await createCore(client);
    goal = await createGoal(client, core.id, { milestones: ['5k', '10k', 'Half'] });
  });

  afterAll(async () => {
    await app.close();
  });

  it('ticking the last open milestone completes the goal, once', async () => {
    const [a, b, c] = ids();
    expect((await toggle(a!)).body).toMatchObject({
      milestone: { id: a, completedAt: expect.any(String) },
      goal: { status: 'ACTIVE', progress: 1 / 3 },
      goalJustCompleted: false,
    });
    await toggle(b!);
    const last = await toggle(c!);
    expect(last.status).toBe(200);
    expect(last.body).toMatchObject({
      goal: { status: 'COMPLETED', completedAt: expect.any(String), progress: 1 },
      goalJustCompleted: true,
    });
  });

  it('unticking reopens a completed goal', async () => {
    for (const id of ids()) {
      await toggle(id);
    }
    const res = await toggle(ids()[1]!);
    expect(res.body).toMatchObject({
      milestone: { completedAt: null },
      goal: { status: 'ACTIVE', completedAt: null },
      goalJustCompleted: false,
    });
  });

  it('adding a milestone to a completed goal reopens it', async () => {
    for (const id of ids()) {
      await toggle(id);
    }
    const res = await client.post(`/goals/${goal.id}/milestones`, { title: 'Marathon' });
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({
      milestone: { title: 'Marathon', sortOrder: 3, completedAt: null },
      goal: { status: 'ACTIVE', milestoneCounts: { done: 3, total: 4 } },
      goalJustCompleted: false,
    });
  });

  it('deleting the last open milestone completes the goal', async () => {
    const [a, b, c] = ids();
    await toggle(a!);
    await toggle(b!);
    const res = await client.delete(`/milestones/${c}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      goal: { status: 'COMPLETED', milestoneCounts: { done: 2, total: 2 } },
      goalJustCompleted: true,
    });
  });

  it('deleting every milestone leaves the status alone', async () => {
    for (const id of ids()) {
      await client.delete(`/milestones/${id}`);
    }
    const detail = (await client.get(`/goals/${goal.id}`)).body;
    expect(detail).toMatchObject({ status: 'ACTIVE', progress: null, milestones: [] });
  });

  it('renames', async () => {
    const res = await client.patch(`/milestones/${ids()[0]}`, { title: ' 5 km ' });
    expect(res.status).toBe(200);
    expect(res.body.title).toBe('5 km');
  });

  it('reorders when every milestone is listed exactly once', async () => {
    const [a, b, c] = ids();
    const res = await client.put(`/goals/${goal.id}/milestones/order`, { ids: [c, a, b] });
    expect(res.status).toBe(200);
    expect(res.body.map((m: { title: string }) => m.title)).toEqual(['Half', '5k', '10k']);
    const detail = (await client.get(`/goals/${goal.id}`)).body as GoalDetailDto;
    expect(detail.milestones.map((m) => m.title)).toEqual(['Half', '5k', '10k']);

    expect((await client.put(`/goals/${goal.id}/milestones/order`, { ids: [a, b] })).status).toBe(
      400,
    );
    const foreign = [a, b, crypto.randomUUID()];
    expect((await client.put(`/goals/${goal.id}/milestones/order`, { ids: foreign })).status).toBe(
      400,
    );
  });

  it('caps a goal at 50 milestones', async () => {
    for (let n = 3; n < 50; n += 1) {
      expect((await client.post(`/goals/${goal.id}/milestones`, { title: `m${n}` })).status).toBe(
        201,
      );
    }
    const res = await client.post(`/goals/${goal.id}/milestones`, { title: 'one too many' });
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ code: 'LIMIT_REACHED', details: { limit: 50 } });
  });

  it('concurrent toggles of different milestones still complete the goal exactly once', async () => {
    const results = await Promise.all(ids().map((id) => toggle(id)));
    expect(results.every((res) => res.status === 200)).toBe(true);
    expect(results.filter((res) => res.body.goalJustCompleted)).toHaveLength(1);
    expect((await client.get(`/goals/${goal.id}`)).body.status).toBe('COMPLETED');
  });

  it('returns 404 MILESTONE_NOT_FOUND for a malformed or unknown id', async () => {
    expect((await toggle('nope')).body.code).toBe('MILESTONE_NOT_FOUND');
    expect((await toggle(crypto.randomUUID())).status).toBe(404);
  });
});
