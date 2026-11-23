import type { LocalDate } from '../dates/local-date.js';
import type {
  HabitType,
  ScheduleType,
  StepType,
  TargetChangeKind,
  TargetField,
  TimeOfDay,
} from '../enums.js';

export interface HabitDto {
  id: string;
  coreId: string;
  name: string;
  type: HabitType;
  unit: string | null;
  /** Count units, or seconds for durations. Always 1 for toggles. */
  targetValue: number;
  initialTargetValue: number;
  scheduleType: ScheduleType;
  daysOfWeek: number[];
  timesPerWeek: number | null;
  /** DAILY only: due every N days (1 = every day). */
  intervalDays: number | null;
  initialTimesPerWeek: number | null;
  timeOfDay: TimeOfDay;
  adaptiveEnabled: boolean;
  /** False for a toggle that isn't TIMES_PER_WEEK: the UI hides the level settings. */
  adaptiveApplicable: boolean;
  stepType: StepType;
  stepValue: number;
  minTarget: number | null;
  maxTarget: number | null;
  longestStreak: number;
  startDate: LocalDate;
  sortOrder: number;
  archivedAt: string | null;
}

export interface TargetChangeDto {
  id: string;
  habitId: string;
  kind: TargetChangeKind;
  field: TargetField;
  /** For DAYS_OF_WEEK, a bitmask: use `maskToDays`. */
  fromValue: number;
  toValue: number;
  effectiveFrom: LocalDate;
  undoDeadline: string | null;
  undoneAt: string | null;
  createdAt: string;
}

export interface HabitDetailDto extends HabitDto {
  /** As of the local today. */
  currentStreak: number;
  /** The 10 most recent target changes, newest first. */
  recentChanges: TargetChangeDto[];
}
