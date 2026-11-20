import { describe, expect, it } from 'vitest';
import { CORE_PRESETS } from '../constants.js';
import { createHabitSchema } from '../schemas/habit.js';
import { HABIT_TEMPLATES } from './templates.js';

const coreId = '00000000-0000-4000-8000-000000000001';

describe('habit templates', () => {
  it('cover every core preset with two or three', () => {
    for (const preset of CORE_PRESETS) {
      expect(HABIT_TEMPLATES[preset.name].length).toBeGreaterThanOrEqual(2);
      expect(HABIT_TEMPLATES[preset.name].length).toBeLessThanOrEqual(3);
    }
  });

  it.each(
    Object.entries(HABIT_TEMPLATES).flatMap(([core, list]) =>
      list.map((t) => [core, t.name, t] as const),
    ),
  )('%s: "%s" is a habit the API accepts', (_core, _name, template) => {
    expect(createHabitSchema.safeParse({ ...template, coreId }).error?.issues).toBeUndefined();
  });

  it('have distinct names', () => {
    const names = Object.values(HABIT_TEMPLATES).flatMap((list) => list.map((t) => t.name));
    expect(new Set(names).size).toBe(names.length);
  });
});
