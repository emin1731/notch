import { describe, expect, it } from 'vitest';
import { CORE_PRESETS } from '../constants.js';
import { idsOrderSchema } from './common.js';
import {
  batchCoresSchema,
  createCoreSchema,
  listCoresQuerySchema,
  updateCoreSchema,
} from './core.js';
import { createGoalSchema, listGoalsQuerySchema, updateGoalSchema } from './goal.js';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

describe('core schemas', () => {
  it('accepts every preset', () => {
    for (const preset of CORE_PRESETS) {
      expect(createCoreSchema.parse(preset)).toEqual(preset);
    }
  });

  it('rejects colors outside the palette and odd icon names', () => {
    expect(createCoreSchema.safeParse({ name: 'X', color: 'red', icon: 'x' }).success).toBe(false);
    expect(
      createCoreSchema.safeParse({ name: 'X', color: 'sky', icon: 'Heart Pulse' }).success,
    ).toBe(false);
  });

  it('requires something to update', () => {
    expect(updateCoreSchema.safeParse({}).success).toBe(false);
    expect(updateCoreSchema.parse({ name: ' Body ' })).toEqual({ name: 'Body' });
  });

  it('caps a batch at 20', () => {
    const core = { name: 'X', color: 'sky', icon: 'x' };
    expect(batchCoresSchema.safeParse({ cores: Array(20).fill(core) }).success).toBe(true);
    expect(batchCoresSchema.safeParse({ cores: Array(21).fill(core) }).success).toBe(false);
    expect(batchCoresSchema.safeParse({ cores: [] }).success).toBe(false);
  });

  it('reads includeArchived from the query string', () => {
    expect(listCoresQuerySchema.parse({})).toEqual({ includeArchived: false });
    expect(listCoresQuerySchema.parse({ includeArchived: 'true' })).toEqual({
      includeArchived: true,
    });
    expect(listCoresQuerySchema.safeParse({ includeArchived: 'maybe' }).success).toBe(false);
  });
});

describe('goal schemas', () => {
  it('creates with inline milestones, at most 50', () => {
    const goal = { coreId: id(1), title: ' Run a marathon ', deadline: '2027-04-01' };
    expect(createGoalSchema.parse({ ...goal, milestones: ['5k', '10k'] })).toMatchObject({
      title: 'Run a marathon',
      milestones: ['5k', '10k'],
    });
    expect(createGoalSchema.safeParse({ ...goal, milestones: Array(51).fill('m') }).success).toBe(
      false,
    );
    expect(createGoalSchema.safeParse({ ...goal, deadline: '2027-02-30' }).success).toBe(false);
  });

  it('clears fields with null and requires something to update', () => {
    expect(updateGoalSchema.parse({ deadline: null })).toEqual({ deadline: null });
    expect(updateGoalSchema.safeParse({}).success).toBe(false);
  });

  it('filters by status, not ARCHIVED', () => {
    expect(listGoalsQuerySchema.parse({ status: 'COMPLETED' }).status).toBe('COMPLETED');
    expect(listGoalsQuerySchema.safeParse({ status: 'ARCHIVED' }).success).toBe(false);
  });
});

describe('idsOrderSchema', () => {
  it('needs 1 to 200 unique uuids', () => {
    expect(idsOrderSchema.safeParse({ ids: [id(1), id(2)] }).success).toBe(true);
    expect(idsOrderSchema.safeParse({ ids: [id(1), id(1)] }).success).toBe(false);
    expect(idsOrderSchema.safeParse({ ids: [] }).success).toBe(false);
    expect(idsOrderSchema.safeParse({ ids: ['nope'] }).success).toBe(false);
    const many = Array.from({ length: 201 }, (_, n) => id(n));
    expect(idsOrderSchema.safeParse({ ids: many }).success).toBe(false);
  });
});
