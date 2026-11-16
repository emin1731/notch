import {
  adaptiveApplicable,
  type HabitDto,
  type TargetChangeDto,
  toDateString,
} from '@notch/shared';
import type { Habit, TargetChange } from '../generated/prisma/client.js';

export function toHabitDto(habit: Habit): HabitDto {
  return {
    id: habit.id,
    coreId: habit.coreId,
    goalId: habit.goalId,
    name: habit.name,
    type: habit.type,
    unit: habit.unit,
    targetValue: habit.targetValue,
    initialTargetValue: habit.initialTargetValue,
    scheduleType: habit.scheduleType,
    daysOfWeek: habit.daysOfWeek,
    timesPerWeek: habit.timesPerWeek,
    initialTimesPerWeek: habit.initialTimesPerWeek,
    timeOfDay: habit.timeOfDay,
    adaptiveEnabled: habit.adaptiveEnabled,
    adaptiveApplicable: adaptiveApplicable(habit),
    stepType: habit.stepType,
    stepValue: habit.stepValue,
    minTarget: habit.minTarget,
    maxTarget: habit.maxTarget,
    longestStreak: habit.longestStreak,
    startDate: toDateString(habit.startDate),
    sortOrder: habit.sortOrder,
    archivedAt: habit.archivedAt?.toISOString() ?? null,
  };
}

export function toTargetChangeDto(change: TargetChange): TargetChangeDto {
  return {
    id: change.id,
    habitId: change.habitId,
    kind: change.kind,
    field: change.field,
    fromValue: change.fromValue,
    toValue: change.toValue,
    effectiveFrom: toDateString(change.effectiveFrom),
    undoDeadline: change.undoDeadline?.toISOString() ?? null,
    undoneAt: change.undoneAt?.toISOString() ?? null,
    createdAt: change.createdAt.toISOString(),
  };
}
