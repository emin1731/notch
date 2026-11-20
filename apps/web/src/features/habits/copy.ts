import type { HabitDto } from '@notch/shared';
import { streakText } from '@/lib/stats-format';

/** Plan section 14: "Streak reset. Your longest is still 21 days. Go beat it." */
export const streakResetText = (habit: Pick<HabitDto, 'longestStreak' | 'scheduleType'>) =>
  `Streak reset. Your longest is still ${streakText(habit.longestStreak, habit.scheduleType)}. Go beat it.`;
