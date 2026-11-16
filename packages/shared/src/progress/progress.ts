import type { HabitType } from '../enums.js';

/** Highest value one day's log can hold, per habit type. */
export const LOG_LIMITS = { TOGGLE: 1, COUNT: 100_000, DURATION: 24 * 60 * 60 } as const;

export function maxLogValue(type: HabitType): number {
  return LOG_LIMITS[type];
}

export interface LogLite {
  date: string;
  value: number;
  /** The habit's target when the log was first created. */
  targetSnapshot: number;
}

/** 0..1. Overachievement shows as more than the target but caps progress at 100%. */
export function computeProgress(value: number, target: number): number {
  return target <= 0 ? 0 : Math.min(value / target, 1);
}

/** A log is a hit when it reaches the target it was logged against. */
export function isHit(log: Pick<LogLite, 'value' | 'targetSnapshot'> | undefined): boolean {
  return log !== undefined && log.value > 0 && log.value >= log.targetSnapshot;
}
