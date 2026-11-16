import {
  type ChangeLite,
  habitHistory,
  type HabitHistory,
  type LogLite,
  type ScheduleSnapshot,
  toDateString,
} from '@notch/shared';
import type { Habit, HabitLog, TargetChange } from '../generated/prisma/client.js';

/** Prisma rows → the inputs of the shared rate, streak and history functions. */
export function toChangeLite(change: TargetChange): ChangeLite {
  return {
    field: change.field,
    fromValue: change.fromValue,
    toValue: change.toValue,
    effectiveFrom: toDateString(change.effectiveFrom),
    undone: change.undoneAt !== null,
    createdAt: change.createdAt,
  };
}

export function toLogLite(log: HabitLog): LogLite {
  return { date: toDateString(log.date), value: log.value, targetSnapshot: log.targetSnapshot };
}

export function scheduleOf(habit: Habit): ScheduleSnapshot {
  return {
    scheduleType: habit.scheduleType,
    daysOfWeek: habit.daysOfWeek,
    timesPerWeek: habit.timesPerWeek,
    startDate: toDateString(habit.startDate),
  };
}

export function historyOf(
  habit: Habit,
  changes: readonly TargetChange[],
  logs: readonly HabitLog[],
): HabitHistory {
  return habitHistory(scheduleOf(habit), changes.map(toChangeLite), logs.map(toLogLite));
}
