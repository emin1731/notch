import type { CoreColor, CorePresetName, HabitTemplate, UserDto } from '@notch/shared';
import { formatValue, scheduleText } from '@/lib/habit-format';

/** A core picked during onboarding; `key` names it until the API gives it an id. */
export interface DraftCore {
  key: string;
  /** The preset it came from, for its habit suggestions (kept if it's renamed). */
  preset: CorePresetName | null;
  name: string;
  color: CoreColor;
  icon: string;
}

export interface DraftHabit {
  key: string;
  coreKey: string;
  /** From a suggestion (`HABIT_TEMPLATES`), or made with the form. */
  fromTemplate: boolean;
  input: HabitTemplate;
}

export interface OnboardingDraft {
  cores: DraftCore[];
  habits: DraftHabit[];
}

/** What the API has already created, by draft key: a retry skips these. */
export interface Created {
  cores: Record<string, string>;
  habits: Record<string, string>;
}

export const NOTHING_CREATED: Created = { cores: {}, habits: {} };

export type SubmitPhase = 'cores' | 'habits' | 'complete';

/** A failed submission, shown on its step with a way to retry. */
export interface SubmitFailure {
  phase: SubmitPhase;
  message: string;
}

/** The step a failure belongs to, so the user lands where they can fix it. */
export const STEP_OF_PHASE: Record<SubmitPhase, number> = {
  cores: 0,
  habits: 1,
  complete: 2,
};

export const presetKey = (name: CorePresetName) => `preset:${name}`;
export const templateKey = (coreKey: string, name: string) => `template:${coreKey}:${name}`;

/** Above this many habits, onboarding gently suggests starting smaller. */
export const SOFT_HABIT_LIMIT = 5;

/** "20 min · Every day", "3× a week": what a suggestion asks for. */
export function templateSummary(template: HabitTemplate): string {
  const schedule = scheduleText({
    scheduleType: template.scheduleType,
    daysOfWeek: template.daysOfWeek ?? [],
    timesPerWeek: template.timesPerWeek ?? null,
  });
  if (template.type === 'TOGGLE' || template.targetValue === undefined) {
    return schedule;
  }
  return `${formatValue(template.type, template.targetValue, template.unit ?? null)} · ${schedule}`;
}

/** The API calls onboarding needs, so the submission can be tested without a server. */
export interface OnboardingApi {
  createCores: (
    cores: { name: string; color: CoreColor; icon: string }[],
  ) => Promise<{ id: string }[]>;
  createHabit: (input: HabitTemplate & { coreId: string }) => Promise<{ id: string }>;
  complete: () => Promise<UserDto>;
}

export class OnboardingSubmitError extends Error {
  constructor(
    readonly phase: SubmitPhase,
    override readonly cause: unknown,
  ) {
    super(`Onboarding failed at ${phase}`);
  }
}

/**
 * Creates the draft in order (cores, then each habit) and marks onboarding done. Whatever
 * `created` already holds is skipped, and `save` records each step as it lands: a retry, or a
 * reload in between, never creates anything twice (plan 7.5).
 */
export async function submitOnboarding(
  draft: OnboardingDraft,
  initial: Created,
  api: OnboardingApi,
  save: (created: Created) => void,
): Promise<UserDto> {
  let created: Created = {
    cores: { ...initial.cores },
    habits: { ...initial.habits },
  };
  const record = (next: Created) => {
    created = next;
    save(next);
  };
  const run = async <T>(phase: SubmitPhase, call: () => Promise<T>): Promise<T> => {
    try {
      return await call();
    } catch (error) {
      throw new OnboardingSubmitError(phase, error);
    }
  };
  const coreId = (key: string) => {
    const id = created.cores[key];
    if (!id) {
      throw new OnboardingSubmitError('cores', new Error(`Core ${key} wasn't created`));
    }
    return id;
  };

  const newCores = draft.cores.filter((core) => !created.cores[core.key]);
  if (newCores.length > 0) {
    const saved = await run('cores', () =>
      api.createCores(newCores.map(({ name, color, icon }) => ({ name, color, icon }))),
    );
    const ids = { ...created.cores };
    newCores.forEach((core, index) => {
      ids[core.key] = saved[index]!.id;
    });
    record({ ...created, cores: ids });
  }

  for (const habit of draft.habits) {
    if (created.habits[habit.key]) {
      continue;
    }
    const saved = await run('habits', () =>
      api.createHabit({ ...habit.input, coreId: coreId(habit.coreKey) }),
    );
    record({ ...created, habits: { ...created.habits, [habit.key]: saved.id } });
  }

  return run('complete', () => api.complete());
}
