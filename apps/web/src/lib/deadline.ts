import { daysBetween, type GoalStatus, type LocalDate } from '@notch/shared';

export interface DeadlineText {
  text: string;
  overdue: boolean;
}

/** "12 days left", "Due today", "Overdue" (plan 7.5). Nothing for no deadline or a finished goal. */
export function deadlineText(
  deadline: LocalDate | null,
  status: GoalStatus,
  today: LocalDate,
): DeadlineText | null {
  if (!deadline || status === 'COMPLETED') {
    return null;
  }
  const days = daysBetween(today, deadline);
  if (days < 0) {
    return { text: 'Overdue', overdue: true };
  }
  if (days === 0) {
    return { text: 'Due today', overdue: false };
  }
  return { text: days === 1 ? '1 day left' : `${days} days left`, overdue: false };
}

/** "Dec 31, 2026" for a local date, independent of the browser's timezone. */
export function formatLocalDate(date: LocalDate): string {
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`));
}
