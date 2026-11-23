import {
  addDays,
  adaptiveApplicable,
  createHabitSchema,
  type HabitDto,
  type HabitShape,
  habitShapeIssues,
  type HabitType,
  type LocalDate,
  PROGRESSION_CONFIG,
  progressingField,
  projectLevels,
  type ScheduleType,
  type StepType,
  type TimeOfDay,
  type UpdateHabitInput,
} from '@notch/shared';
import type { FieldErrors, Resolver } from 'react-hook-form';
import type { z } from 'zod';
import { formatMinutes } from '@/lib/habit-format';

/**
 * The habit form's values, in the units people think in: minutes for durations, times a week for
 * a frequency, days between for a daily habit. `toHabitInput` converts them to the API's (seconds).
 */
export interface HabitFormValues {
  name: string;
  coreId: string;
  type: HabitType;
  unit: string;
  /** Count units, or minutes for a duration. Unused for a toggle. */
  target: number | null;
  scheduleType: ScheduleType;
  daysOfWeek: number[];
  timesPerWeek: number;
  /** A daily habit's "every N days" (1 = every day). */
  intervalDays: number;
  timeOfDay: TimeOfDay;
  adaptiveEnabled: boolean;
  stepType: StepType;
  /** Percent, or units / minutes when ABSOLUTE. */
  stepValue: number | null;
  /** In the progressing field's units: count units, minutes, or times a week. */
  minTarget: number | null;
  maxTarget: number | null;
  startDate: LocalDate;
}

export type HabitFormField = keyof HabitFormValues;

const DEFAULT_TARGET = { COUNT: 1, DURATION: 10 } as const;
const DEFAULT_TIMES_PER_WEEK = 3;
const MINUTE = 60;

export function defaultValues({
  coreId = '',
  today,
}: {
  coreId?: string;
  today: LocalDate;
}): HabitFormValues {
  return {
    name: '',
    coreId,
    type: 'TOGGLE',
    unit: '',
    target: null,
    scheduleType: 'DAILY',
    daysOfWeek: [],
    timesPerWeek: DEFAULT_TIMES_PER_WEEK,
    intervalDays: 1,
    timeOfDay: 'ANYTIME',
    adaptiveEnabled: true,
    stepType: 'PERCENT',
    stepValue: PROGRESSION_CONFIG.defaultStepPercent,
    minTarget: null,
    maxTarget: null,
    startDate: today,
  };
}

/** Seconds per form unit for the target (and absolute steps): 60 for durations. */
const targetFactor = (type: HabitType) => (type === 'DURATION' ? MINUTE : 1);

/** Seconds per form unit for min/max: they follow the progressing field. */
function boundFactor(values: Pick<HabitFormValues, 'type' | 'scheduleType'>): number {
  return progressingField(values) === 'TARGET_VALUE' ? targetFactor(values.type) : 1;
}

const times = (value: number | null, factor: number) => (value === null ? null : value * factor);

export function valuesFromHabit(habit: HabitDto): HabitFormValues {
  const target = targetFactor(habit.type);
  const bound = boundFactor(habit);
  return {
    name: habit.name,
    coreId: habit.coreId,
    type: habit.type,
    unit: habit.unit ?? '',
    target: habit.type === 'TOGGLE' ? null : habit.targetValue / target,
    scheduleType: habit.scheduleType,
    daysOfWeek: habit.daysOfWeek,
    timesPerWeek: habit.timesPerWeek ?? DEFAULT_TIMES_PER_WEEK,
    intervalDays: habit.intervalDays ?? 1,
    timeOfDay: habit.timeOfDay,
    adaptiveEnabled: habit.adaptiveEnabled,
    stepType: habit.stepType,
    stepValue: habit.stepType === 'ABSOLUTE' ? habit.stepValue / target : habit.stepValue,
    minTarget: habit.minTarget === null ? null : habit.minTarget / bound,
    maxTarget: habit.maxTarget === null ? null : habit.maxTarget / bound,
    startDate: habit.startDate,
  };
}

/** The create payload in API units, before the shared schema parses it. */
export function toHabitInput(values: HabitFormValues): z.input<typeof createHabitSchema> {
  const target = targetFactor(values.type);
  const bound = boundFactor(values);
  const adaptive = adaptiveApplicable(values);
  return {
    coreId: values.coreId,
    name: values.name,
    type: values.type,
    unit: values.type === 'COUNT' ? values.unit.trim() || null : null,
    targetValue: values.type === 'TOGGLE' ? undefined : (times(values.target, target) ?? undefined),
    scheduleType: values.scheduleType,
    daysOfWeek: values.scheduleType === 'SPECIFIC_DAYS' ? values.daysOfWeek : [],
    timesPerWeek: values.scheduleType === 'TIMES_PER_WEEK' ? values.timesPerWeek : null,
    intervalDays: values.scheduleType === 'DAILY' ? values.intervalDays : null,
    timeOfDay: values.timeOfDay,
    adaptiveEnabled: values.adaptiveEnabled,
    stepType: values.stepType,
    stepValue:
      (values.stepType === 'ABSOLUTE' ? times(values.stepValue, target) : values.stepValue) ??
      undefined,
    minTarget: adaptive ? times(values.minTarget, bound) : null,
    maxTarget: adaptive ? times(values.maxTarget, bound) : null,
    startDate: values.startDate,
  };
}

/** The fields the cross-field rules and the step math look at, from a (possibly partial) input. */
function shapeOf(input: z.input<typeof createHabitSchema>): HabitShape {
  return {
    type: input.type,
    unit: input.unit ?? null,
    targetValue: input.targetValue ?? 1,
    scheduleType: input.scheduleType,
    daysOfWeek: input.daysOfWeek ?? [],
    timesPerWeek: input.timesPerWeek ?? null,
    intervalDays: input.intervalDays ?? (input.scheduleType === 'DAILY' ? 1 : null),
    stepType: input.stepType ?? 'PERCENT',
    stepValue: input.stepValue ?? PROGRESSION_CONFIG.defaultStepPercent,
    minTarget: input.minTarget ?? null,
    maxTarget: input.maxTarget ?? null,
  };
}

/** Where each API field shows its error on the form. */
const FIELD_BY_PATH: Record<string, HabitFormField> = {
  targetValue: 'target',
  unit: 'unit',
  name: 'name',
  coreId: 'coreId',
  type: 'type',
  scheduleType: 'scheduleType',
  daysOfWeek: 'daysOfWeek',
  timesPerWeek: 'timesPerWeek',
  intervalDays: 'intervalDays',
  timeOfDay: 'timeOfDay',
  stepValue: 'stepValue',
  stepType: 'stepType',
  minTarget: 'minTarget',
  maxTarget: 'maxTarget',
  startDate: 'startDate',
};

export const formFieldForPath = (path: string): HabitFormField | undefined =>
  FIELD_BY_PATH[path.split('.')[0] ?? ''];

const START_AHEAD_DAYS = 365;

export function startDateRange(today: LocalDate) {
  return {
    min: addDays(today, -PROGRESSION_CONFIG.backfillDays),
    max: addDays(today, START_AHEAD_DAYS),
  };
}

/**
 * Validates with the shared `createHabitSchema` (the API's own rules) on the converted values, and
 * puts each issue on the field it belongs to. Edits are checked the same way: the API re-checks
 * the merged habit.
 */
export function habitFormResolver({
  today,
  editing,
}: {
  today: LocalDate;
  editing: boolean;
}): Resolver<HabitFormValues> {
  return async (values) => {
    const errors: FieldErrors<HabitFormValues> = {};
    const add = (field: HabitFormField, message: string) => {
      errors[field] ??= { type: 'validate', message };
    };

    for (const field of ['target', 'stepValue', 'minTarget', 'maxTarget'] as const) {
      const value = values[field];
      if (value !== null && !Number.isInteger(value)) {
        add(field, 'Use a whole number');
      }
    }
    if (adaptiveApplicable(values) && values.stepType === 'ABSOLUTE' && values.stepValue === null) {
      add('stepValue', 'Set a step');
    }
    if (!editing) {
      const { min, max } = startDateRange(today);
      if (values.startDate < min || values.startDate > max) {
        add('startDate', `Between ${PROGRESSION_CONFIG.backfillDays} days ago and a year from now`);
      }
    }

    const input = toHabitInput(values);
    const result = createHabitSchema.safeParse(input);
    if (!result.success) {
      for (const issue of result.error.issues) {
        add(formFieldForPath(issue.path.join('.')) ?? 'name', issue.message);
      }
      // zod skips the cross-field rules while a plain field (say, the name) is invalid; check
      // them too, so every problem shows at once.
      for (const issue of habitShapeIssues(shapeOf(input))) {
        const field = formFieldForPath(issue.path);
        if (field) {
          add(field, issue.message);
        }
      }
    }

    return Object.keys(errors).length > 0 ? { values: {}, errors } : { values, errors: {} };
  };
}

/** What switching the type does to the other fields (creating only: the type is fixed after). */
export function resetForType(values: HabitFormValues, type: HabitType): Partial<HabitFormValues> {
  if (type === values.type) {
    return {};
  }
  return {
    type,
    target: type === 'TOGGLE' ? null : DEFAULT_TARGET[type],
    unit: '',
    // An absolute step and bounds were in the old type's units.
    stepType: 'PERCENT',
    stepValue: PROGRESSION_CONFIG.defaultStepPercent,
    minTarget: null,
    maxTarget: null,
  };
}

/** What switching the schedule does to the other fields (creating only). */
export function resetForSchedule(
  values: HabitFormValues,
  scheduleType: ScheduleType,
): Partial<HabitFormValues> {
  if (scheduleType === values.scheduleType) {
    return {};
  }
  const patch: Partial<HabitFormValues> = {
    scheduleType,
    daysOfWeek: [],
    timesPerWeek: DEFAULT_TIMES_PER_WEEK,
    intervalDays: 1,
  };
  // A toggle's bounds count times a week; they mean nothing once it isn't weekly any more.
  if (progressingField(values) !== progressingField({ type: values.type, scheduleType })) {
    patch.minTarget = null;
    patch.maxTarget = null;
  }
  return patch;
}

const sameDays = (a: readonly number[], b: readonly number[]) =>
  a.length === b.length && a.every((day, index) => day === b[index]);

/**
 * The PATCH body for an edit: only what changed, so an untouched target never counts as a manual
 * change. Type, schedule type and start date never change. `null` if the values don't parse.
 */
export function changedFields(habit: HabitDto, values: HabitFormValues): UpdateHabitInput | null {
  const parsed = createHabitSchema.safeParse(toHabitInput(values));
  if (!parsed.success) {
    return null;
  }
  const next = parsed.data;
  const changes: UpdateHabitInput = {};
  if (next.coreId !== habit.coreId) changes.coreId = next.coreId;
  if (next.name !== habit.name) changes.name = next.name;
  if (next.unit !== habit.unit) changes.unit = next.unit;
  if (next.targetValue !== habit.targetValue) changes.targetValue = next.targetValue;
  if (habit.scheduleType === 'SPECIFIC_DAYS' && !sameDays(next.daysOfWeek, habit.daysOfWeek)) {
    changes.daysOfWeek = next.daysOfWeek;
  }
  if (
    habit.scheduleType === 'TIMES_PER_WEEK' &&
    next.timesPerWeek !== null &&
    next.timesPerWeek !== habit.timesPerWeek
  ) {
    changes.timesPerWeek = next.timesPerWeek;
  }
  if (
    habit.scheduleType === 'DAILY' &&
    next.intervalDays !== null &&
    next.intervalDays !== habit.intervalDays
  ) {
    changes.intervalDays = next.intervalDays;
  }
  if (next.timeOfDay !== habit.timeOfDay) changes.timeOfDay = next.timeOfDay;
  if (next.adaptiveEnabled !== habit.adaptiveEnabled)
    changes.adaptiveEnabled = next.adaptiveEnabled;
  if (next.stepType !== habit.stepType) changes.stepType = next.stepType;
  if (next.stepValue !== habit.stepValue) changes.stepValue = next.stepValue;
  if (next.minTarget !== habit.minTarget) changes.minTarget = next.minTarget;
  if (next.maxTarget !== habit.maxTarget) changes.maxTarget = next.maxTarget;
  return changes;
}

/**
 * What saving an edit means for levels (plan 7.5's note): editing the target, the days, the times
 * a week or the interval writes a manual change. A new interval counts from today. `null` when the
 * edit changes none of them.
 */
export function manualChangeNote(habit: HabitDto, values: HabitFormValues): string | null {
  const changes = changedFields(habit, values);
  if (changes === null) {
    return null;
  }
  const target =
    changes.targetValue !== undefined ||
    changes.daysOfWeek !== undefined ||
    changes.timesPerWeek !== undefined;
  const interval = changes.intervalDays !== undefined;
  if (!target && !interval) {
    return null;
  }
  return [
    interval && 'The new rhythm starts today. Past days keep the old one.',
    `This counts as a manual change. Levels will wait for two full weeks${target ? ' at the new target' : ''} before adjusting.`,
  ]
    .filter(Boolean)
    .join(' ');
}

const PREVIEW_LEVELS = 3;

/**
 * "If you're consistent: 10 → 11 → 12 → 13 min over the next 6 weeks." From the shared
 * `projectLevels`, so it matches what the weekly review will do. `null` when there's nothing to
 * preview (levels off, a toggle that isn't weekly, or values that don't parse yet).
 */
export function previewText(values: HabitFormValues): string | null {
  if (!values.adaptiveEnabled || !adaptiveApplicable(values)) {
    return null;
  }
  // Only the level settings matter here, not the name or the core.
  const input = toHabitInput(values);
  const isWhole = (value: number | null | undefined) =>
    value === undefined || value === null || (Number.isInteger(value) && value >= 1);
  if (
    ![input.targetValue, input.stepValue, input.minTarget, input.maxTarget].every(isWhole) ||
    (input.stepType === 'ABSOLUTE' && input.stepValue === undefined)
  ) {
    return null;
  }
  const habit = shapeOf(input);
  if (habitShapeIssues(habit).length > 0) {
    return null;
  }
  const frequency = progressingField(habit) === 'TIMES_PER_WEEK';
  const current = frequency ? habit.timesPerWeek : input.targetValue;
  if (current === null || current === undefined) {
    return null;
  }
  const levels = projectLevels(habit, current, PREVIEW_LEVELS);
  const format = (value: number) =>
    frequency ? `${value}×` : habit.type === 'DURATION' ? String(value / MINUTE) : String(value);
  const unit = frequency
    ? ' a week'
    : habit.type === 'DURATION'
      ? ' min'
      : habit.unit
        ? ` ${habit.unit}`
        : '';

  if (levels.length === 1) {
    return `Already at the maximum: it stays at ${format(current)}${unit}.`;
  }
  const path = `${levels.map((level) => format(level.value)).join(' → ')}${unit}`;
  const weeks = levels.at(-1)!.week;
  const stops = levels.length <= PREVIEW_LEVELS ? ', then it stays at the maximum' : '';
  return `If you're consistent: ${path} over the next ${weeks} weeks${stops}.`;
}

/** "= 1 h 30 min" next to a minutes field, from an hour up. */
export function minutesHint(minutes: number | null): string | null {
  return minutes !== null && Number.isInteger(minutes) && minutes >= 60
    ? `= ${formatMinutes(minutes)}`
    : null;
}
