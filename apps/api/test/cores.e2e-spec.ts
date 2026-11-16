import type { NestExpressApplication } from '@nestjs/platform-express';
import type { CoreDto } from '@notch/shared';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { createTestApp } from './create-test-app.js';
import { registerUser, resetDb } from './helpers/auth.js';
import { createCore, createGoal } from './helpers/structure.js';
import type { TestClient } from './helpers/test-client.js';

const names = (cores: CoreDto[]) => cores.map((core) => core.name);

describe('cores (e2e)', () => {
  let app: NestExpressApplication;
  let client: TestClient;

  beforeAll(async () => {
    app = await createTestApp();
  });

  beforeEach(async () => {
    await resetDb(app);
    ({ client } = await registerUser(app));
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates, lists in order and updates', async () => {
    const health = await createCore(client);
    expect(health).toEqual({
      id: expect.any(String),
      name: 'Health',
      color: 'emerald',
      icon: 'heart-pulse',
      sortOrder: 0,
      archivedAt: null,
      counts: { goals: 0 },
    });
    const career = await createCore(client, { name: 'Career', color: 'indigo', icon: 'briefcase' });
    expect(career.sortOrder).toBe(1);

    const updated = await client.patch(`/cores/${health.id}`, { name: 'Body', color: 'teal' });
    expect(updated.status).toBe(200);
    expect(updated.body).toMatchObject({ name: 'Body', color: 'teal', icon: 'heart-pulse' });

    expect(names((await client.get('/cores')).body)).toEqual(['Body', 'Career']);
  });

  it('validates the body', async () => {
    const res = await client.post('/cores', { name: '', color: 'red', icon: 'Bad Icon' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_FAILED');
    expect((await client.patch(`/cores/${(await createCore(client)).id}`, {})).status).toBe(400);
  });

  it('batch-creates in order, appended after existing cores', async () => {
    await createCore(client, { name: 'First' });
    const res = await client.post('/cores/batch', {
      cores: [
        { name: 'Mind', color: 'violet', icon: 'brain' },
        { name: 'Finance', color: 'amber', icon: 'wallet' },
      ],
    });
    expect(res.status).toBe(201);
    expect(res.body.map((core: CoreDto) => [core.name, core.sortOrder])).toEqual([
      ['Mind', 1],
      ['Finance', 2],
    ]);
  });

  it('a batch is all or nothing', async () => {
    const res = await client.post('/cores/batch', {
      cores: [{ name: 'Mind', color: 'violet', icon: 'brain' }, { name: 'Bad' }],
    });
    expect(res.status).toBe(400);
    expect((await client.get('/cores')).body).toEqual([]);
  });

  describe('PUT /cores/order', () => {
    let ids: string[];

    beforeEach(async () => {
      ids = [];
      for (const name of ['A', 'B', 'C', 'D']) {
        ids.push((await createCore(client, { name })).id);
      }
    });

    it('puts the listed cores first and keeps the rest in order', async () => {
      const res = await client.put('/cores/order', { ids: [ids[2], ids[0]] });
      expect(res.status).toBe(200);
      expect(names(res.body)).toEqual(['C', 'A', 'B', 'D']);
      expect(names((await client.get('/cores')).body)).toEqual(['C', 'A', 'B', 'D']);
    });

    it('rejects an unknown id with 404 and changes nothing', async () => {
      const res = await client.put('/cores/order', {
        ids: [ids[3], '00000000-0000-4000-8000-000000000000'],
      });
      expect(res.status).toBe(404);
      expect(res.body.code).toBe('CORE_NOT_FOUND');
      expect(names((await client.get('/cores')).body)).toEqual(['A', 'B', 'C', 'D']);
    });

    it('rejects duplicates and more than 200 ids', async () => {
      expect((await client.put('/cores/order', { ids: [ids[0], ids[0]] })).status).toBe(400);
      const many = Array.from({ length: 201 }, () => crypto.randomUUID());
      expect((await client.put('/cores/order', { ids: many })).status).toBe(400);
    });
  });

  describe('archive', () => {
    it('archives the core and its active goals, and hides them by default', async () => {
      const core = await createCore(client);
      const active = await createGoal(client, core.id, { title: 'Active' });
      const earlier = await createGoal(client, core.id, { title: 'Archived earlier' });
      const earlierArchive = await client.post(`/goals/${earlier.id}/archive`);

      const res = await client.post(`/cores/${core.id}/archive`);
      expect(res.status).toBe(200);
      expect(res.body.archivedAt).toEqual(expect.any(String));

      const goals = (await client.get('/goals?includeArchived=true')).body;
      const byId = new Map(goals.map((goal: { id: string }) => [goal.id, goal]));
      expect(byId.get(active.id)).toMatchObject({ archivedAt: res.body.archivedAt });
      expect(byId.get(earlier.id)).toMatchObject({ archivedAt: earlierArchive.body.archivedAt });

      expect((await client.get('/cores')).body).toEqual([]);
      expect(names((await client.get('/cores?includeArchived=true')).body)).toEqual(['Health']);
      expect((await client.get('/goals')).body).toEqual([]);
    });

    it('unarchive restores the core only', async () => {
      const core = await createCore(client);
      const goal = await createGoal(client, core.id);
      await client.post(`/cores/${core.id}/archive`);

      const res = await client.post(`/cores/${core.id}/unarchive`);
      expect(res.status).toBe(200);
      expect(res.body.archivedAt).toBeNull();
      expect((await client.get(`/goals/${goal.id}`)).body.archivedAt).toEqual(expect.any(String));
    });

    it('counts only non-archived goals', async () => {
      const core = await createCore(client);
      await createGoal(client, core.id);
      const archived = await createGoal(client, core.id);
      await client.post(`/goals/${archived.id}/archive`);
      expect((await client.get('/cores')).body[0].counts).toEqual({ goals: 1 });
    });
  });

  describe('DELETE /cores/:id', () => {
    it('deletes an empty core', async () => {
      const core = await createCore(client);
      expect((await client.delete(`/cores/${core.id}`)).status).toBe(204);
      expect((await client.get('/cores?includeArchived=true')).body).toEqual([]);
    });

    it('refuses while it has goals, archived ones included', async () => {
      const core = await createCore(client);
      const goal = await createGoal(client, core.id);
      await client.post(`/goals/${goal.id}/archive`);

      const res = await client.delete(`/cores/${core.id}`);
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('CORE_NOT_EMPTY');

      await client.delete(`/goals/${goal.id}`);
      expect((await client.delete(`/cores/${core.id}`)).status).toBe(204);
    });
  });

  it('returns 404 for a malformed id', async () => {
    const res = await client.patch('/cores/not-a-uuid', { name: 'X' });
    expect(res.status).toBe(404);
    expect(res.body.code).toBe('CORE_NOT_FOUND');
  });
});
