import { nextLevelUp, type StepSettings } from './step.js';
import { PROGRESSION_CONFIG } from './config.js';

export interface ProjectedLevel {
  /** The earliest week (from now) this level could be reached. */
  week: number;
  value: number;
}

/**
 * The levels the habit would reach with uninterrupted level-ups, for the habit form's preview.
 * Each level-up needs two consistent weeks, so they're at least two weeks apart.
 */
export function projectLevels(
  habit: StepSettings,
  current: number,
  levels: number,
): ProjectedLevel[] {
  const projected: ProjectedLevel[] = [{ week: 0, value: current }];
  let value = current;
  for (let level = 1; level <= levels; level += 1) {
    const next = nextLevelUp(habit, value);
    if (next === null) {
      break;
    }
    value = next;
    projected.push({ week: level * PROGRESSION_CONFIG.consecutiveWeeksForLevelUp, value });
  }
  return projected;
}
