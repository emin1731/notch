import type { z } from 'zod';
import type { CORE_PRESETS } from '../constants.js';
import type { createHabitSchema } from '../schemas/habit.js';

/** A habit to start from: everything but the core (and goal) it goes in. */
export type HabitTemplate = Omit<z.input<typeof createHabitSchema>, 'coreId' | 'goalId'>;

export type CorePresetName = (typeof CORE_PRESETS)[number]['name'];

/**
 * Suggested first habits for each core preset (plan 7.5 onboarding). Small on purpose: easy to
 * hit at first, so the targets can grow. Durations are seconds.
 */
export const HABIT_TEMPLATES: Record<CorePresetName, readonly HabitTemplate[]> = {
  Health: [
    { name: 'Walk', type: 'DURATION', targetValue: 20 * 60, scheduleType: 'DAILY' },
    {
      name: 'Drink water',
      type: 'COUNT',
      unit: 'glasses',
      targetValue: 8,
      scheduleType: 'DAILY',
    },
    {
      name: 'Strength training',
      type: 'TOGGLE',
      scheduleType: 'TIMES_PER_WEEK',
      timesPerWeek: 3,
    },
  ],
  Career: [
    {
      name: 'Deep work',
      type: 'DURATION',
      targetValue: 60 * 60,
      scheduleType: 'SPECIFIC_DAYS',
      daysOfWeek: [1, 2, 3, 4, 5],
      timeOfDay: 'MORNING',
    },
    {
      name: 'Plan tomorrow',
      type: 'TOGGLE',
      scheduleType: 'SPECIFIC_DAYS',
      daysOfWeek: [1, 2, 3, 4, 5],
      timeOfDay: 'EVENING',
    },
  ],
  Mind: [
    {
      name: 'Meditate',
      type: 'DURATION',
      targetValue: 5 * 60,
      scheduleType: 'DAILY',
      timeOfDay: 'MORNING',
    },
    { name: 'Journal', type: 'TOGGLE', scheduleType: 'DAILY', timeOfDay: 'EVENING' },
  ],
  Relationships: [
    {
      name: 'Call someone close',
      type: 'TOGGLE',
      scheduleType: 'TIMES_PER_WEEK',
      timesPerWeek: 2,
    },
    { name: 'Phone-free dinner', type: 'TOGGLE', scheduleType: 'DAILY', timeOfDay: 'EVENING' },
  ],
  Finance: [
    { name: 'Log spending', type: 'TOGGLE', scheduleType: 'DAILY', timeOfDay: 'EVENING' },
    { name: 'No-spend day', type: 'TOGGLE', scheduleType: 'TIMES_PER_WEEK', timesPerWeek: 2 },
  ],
  Learning: [
    { name: 'Read', type: 'COUNT', unit: 'pages', targetValue: 10, scheduleType: 'DAILY' },
    {
      name: 'Practice a language',
      type: 'DURATION',
      targetValue: 15 * 60,
      scheduleType: 'DAILY',
    },
  ],
};
