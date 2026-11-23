import type { CoreColor } from '../constants.js';
import type { LocalDate } from '../dates/local-date.js';
import type { TargetField } from '../enums.js';
import type { HeatmapDay } from '../stats/series.js';
import type { StatsRange } from '../stats/range.js';

export interface StatsOverviewDto {
  range: StatsRange;
  from: LocalDate;
  to: LocalDate;
  /** The average of the habits' rates (each habit counts equally); null with nothing due. */
  overallRate: number | null;
  /** Daily and specific-day habits only. */
  daily: { date: LocalDate; rate: number | null }[];
  cores: { coreId: string; name: string; color: CoreColor; icon: string; rate: number | null }[];
  /** The 5 best current streaks among active habits (above 0). */
  topStreaks: { habitId: string; name: string; currentStreak: number }[];
  /** Automatic changes that took effect in the range (undone ones aren't counted). */
  changes: { levelUps: number; deloads: number };
}

export interface HabitStatsDto {
  habitId: string;
  range: StatsRange;
  /** The habit's window inside the range: from its start, up to its archive date. */
  from: LocalDate;
  to: LocalDate;
  rate: number | null;
  hits: number;
  occurrences: number;
  currentStreak: number;
  longestStreak: number;
  /** Everything logged in the window (units or seconds), bonus logs included. */
  totalValue: number;
  heatmap: HeatmapDay[];
  /** The field that progresses (TARGET_VALUE for habits that don't adapt). */
  field: Exclude<TargetField, 'DAYS_OF_WEEK'>;
  targetSeries: { date: LocalDate; target: number }[];
}
