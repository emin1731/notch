import {
  daysToMask,
  type ReviewChangeDto,
  type ReviewDto,
  toDateString,
  undoBlockReason,
  type WeeklyReviewSummary,
} from '@notch/shared';
import type { Habit, TargetChange, WeeklyReview } from '../generated/prisma/client.js';
import { toTargetChangeDto } from '../habits/habit-dto.js';

/** The habit's current value of the field a change touched, to check it wasn't edited since. */
export function currentValueOf(
  habit: Pick<Habit, 'targetValue' | 'timesPerWeek' | 'daysOfWeek'>,
  field: TargetChange['field'],
): number {
  switch (field) {
    case 'TARGET_VALUE':
      return habit.targetValue;
    case 'TIMES_PER_WEEK':
      return habit.timesPerWeek ?? 0;
    case 'DAYS_OF_WEEK':
      return daysToMask(habit.daysOfWeek);
  }
}

export type ChangeWithHabit = TargetChange & {
  habit: Pick<Habit, 'name' | 'targetValue' | 'timesPerWeek' | 'daysOfWeek'>;
};

/** `hasLogSince(change)`: whether the habit has a log on or after the change took effect. */
export function toReviewDto(
  review: WeeklyReview & { changes: ChangeWithHabit[] },
  { now, hasLogSince }: { now: Date; hasLogSince: (change: TargetChange) => boolean },
): ReviewDto {
  return {
    id: review.id,
    weekStart: toDateString(review.weekStart),
    inactive: review.inactive,
    seenAt: review.seenAt?.toISOString() ?? null,
    createdAt: review.createdAt.toISOString(),
    summary: review.summary as unknown as WeeklyReviewSummary,
    changes: review.changes.map((change): ReviewChangeDto => {
      const blocked = undoBlockReason(change, {
        now,
        hasLogSinceEffective: hasLogSince(change),
        currentValue: currentValueOf(change.habit, change.field),
      });
      return {
        ...toTargetChangeDto(change),
        habitName: change.habit.name,
        canUndo: blocked === null,
        undoBlockedReason: blocked,
      };
    }),
  };
}
