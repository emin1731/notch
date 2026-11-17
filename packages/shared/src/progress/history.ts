import type { LocalDate } from '../dates/local-date.js';
import type { ChangeLite } from '../progression/history.js';
import type { ScheduleSnapshot } from '../schedule/is-scheduled.js';
import type { LogLite } from './progress.js';

/** Everything the rate and streak functions need about one habit. */
export interface HabitHistory {
  /** The current schedule; past days are read through `scheduleOn` with `changes`. */
  schedule: ScheduleSnapshot;
  changes: readonly ChangeLite[];
  logs: ReadonlyMap<LocalDate, LogLite>;
}

export function habitHistory(
  schedule: ScheduleSnapshot,
  changes: readonly ChangeLite[],
  logs: readonly LogLite[],
): HabitHistory {
  return { schedule, changes, logs: new Map(logs.map((log) => [log.date, log])) };
}
