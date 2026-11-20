import type { UserDto } from '@notch/shared';
import { describe, expect, it } from 'vitest';
import {
  type Created,
  NOTHING_CREATED,
  type OnboardingApi,
  type OnboardingDraft,
  OnboardingSubmitError,
  type SubmitPhase,
  submitOnboarding,
  templateSummary,
} from './onboarding-model';

const draft: OnboardingDraft = {
  cores: [
    {
      key: 'preset:Health',
      preset: 'Health',
      name: 'Health',
      color: 'emerald',
      icon: 'heart-pulse',
    },
    { key: 'custom:1', preset: null, name: 'Music', color: 'sky', icon: 'target' },
  ],
  goal: {
    coreKey: 'preset:Health',
    title: 'Run a half marathon',
    deadline: null,
    milestones: ['5 km', '10 km', 'Race day'],
  },
  habits: [
    {
      key: 'h1',
      coreKey: 'preset:Health',
      fromTemplate: true,
      input: { name: 'Walk', type: 'DURATION', targetValue: 1200, scheduleType: 'DAILY' },
    },
    {
      key: 'h2',
      coreKey: 'custom:1',
      fromTemplate: false,
      input: { name: 'Practice guitar', type: 'TOGGLE', scheduleType: 'DAILY' },
    },
  ],
};

const user = {
  id: 'u1',
  username: 'new',
  name: null,
  timezone: 'UTC',
  onboardedAt: 'now',
} as UserDto;

/** An API that counts each call, and fails the next `failures` calls of a phase. */
function fakeApi(failures: Partial<Record<SubmitPhase, number>> = {}) {
  const calls: { phase: SubmitPhase; input: unknown }[] = [];
  let next = 0;
  const call = async <T>(phase: SubmitPhase, input: unknown, result: T): Promise<T> => {
    calls.push({ phase, input });
    if ((failures[phase] ?? 0) > 0) {
      failures[phase]! -= 1;
      throw new Error(`${phase} failed`);
    }
    return result;
  };
  const api: OnboardingApi = {
    createCores: (cores) =>
      call(
        'cores',
        cores,
        cores.map(() => ({ id: `core-${++next}` })),
      ),
    createGoal: (input) => call('goal', input, { id: `goal-${++next}` }),
    createHabit: (input) => call('habits', input, { id: `habit-${++next}` }),
    complete: () => call('complete', null, user),
  };
  const count = (phase: SubmitPhase) => calls.filter((entry) => entry.phase === phase).length;
  return { api, calls, count };
}

describe('onboarding submission', () => {
  it('creates the cores, the goal and the habits in order, then completes', async () => {
    const { api, calls } = fakeApi();
    const saves: Created[] = [];
    expect(await submitOnboarding(draft, NOTHING_CREATED, api, (c) => saves.push(c))).toBe(user);

    expect(calls.map((c) => c.phase)).toEqual(['cores', 'goal', 'habits', 'habits', 'complete']);
    expect(calls[0]!.input).toEqual([
      { name: 'Health', color: 'emerald', icon: 'heart-pulse' },
      { name: 'Music', color: 'sky', icon: 'target' },
    ]);
    expect(calls[1]!.input).toEqual({
      coreId: 'core-1',
      title: 'Run a half marathon',
      deadline: null,
      milestones: ['5 km', '10 km', 'Race day'],
    });
    expect(calls[2]!.input).toMatchObject({ name: 'Walk', coreId: 'core-1' });
    expect(calls[3]!.input).toMatchObject({ name: 'Practice guitar', coreId: 'core-2' });
    expect(saves.at(-1)).toEqual({
      cores: { 'preset:Health': 'core-1', 'custom:1': 'core-2' },
      goalId: 'goal-3',
      habits: { h1: 'habit-4', h2: 'habit-5' },
    });
  });

  it.each(['cores', 'goal', 'habits', 'complete'] as const)(
    'stops at a failed %s, and a retry creates nothing twice',
    async (phase) => {
      const { api, count } = fakeApi({ [phase]: 1 });
      let created: Created = NOTHING_CREATED;
      const save = (next: Created) => {
        created = next;
      };

      const failure = await submitOnboarding(draft, created, api, save).catch((e: unknown) => e);
      expect(failure).toBeInstanceOf(OnboardingSubmitError);
      expect((failure as OnboardingSubmitError).phase).toBe(phase);

      await expect(submitOnboarding(draft, created, api, save)).resolves.toBe(user);
      // One successful call each; only the failed one was made twice.
      expect(count('cores')).toBe(phase === 'cores' ? 2 : 1);
      expect(count('goal')).toBe(phase === 'goal' ? 2 : 1);
      expect(count('habits')).toBe(phase === 'habits' ? 3 : 2);
      expect(count('complete')).toBe(phase === 'complete' ? 2 : 1);
    },
  );

  it('resumes from what a reload kept, after the first habit', async () => {
    const { api, calls } = fakeApi();
    const kept: Created = {
      cores: { 'preset:Health': 'core-a', 'custom:1': 'core-b' },
      goalId: 'goal-a',
      habits: { h1: 'habit-a' },
    };
    await submitOnboarding(draft, kept, api, () => {});
    expect(calls.map((c) => c.phase)).toEqual(['habits', 'complete']);
    expect(calls[0]!.input).toMatchObject({ name: 'Practice guitar', coreId: 'core-b' });
  });

  it('creates a core added after the others were saved, and skips a missing goal', async () => {
    const { api, calls } = fakeApi();
    const more: OnboardingDraft = {
      ...draft,
      goal: null,
      habits: [],
      cores: [
        ...draft.cores,
        { key: 'custom:2', preset: null, name: 'Art', color: 'rose', icon: 'target' },
      ],
    };
    await submitOnboarding(
      more,
      { ...NOTHING_CREATED, cores: { 'preset:Health': 'core-a', 'custom:1': 'core-b' } },
      api,
      () => {},
    );
    expect(calls.map((c) => c.phase)).toEqual(['cores', 'complete']);
    expect(calls[0]!.input).toEqual([{ name: 'Art', color: 'rose', icon: 'target' }]);
  });

  it('says what a suggestion asks for', () => {
    expect(templateSummary(draft.habits[0]!.input)).toBe('20 min · Every day');
    expect(
      templateSummary({
        name: 'Gym',
        type: 'TOGGLE',
        scheduleType: 'TIMES_PER_WEEK',
        timesPerWeek: 3,
      }),
    ).toBe('3× a week');
    expect(
      templateSummary({
        name: 'Read',
        type: 'COUNT',
        unit: 'pages',
        targetValue: 10,
        scheduleType: 'DAILY',
      }),
    ).toBe('10 pages · Every day');
  });
});
