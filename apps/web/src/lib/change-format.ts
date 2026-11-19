import {
  DECISION_REASON_TEXT,
  type HabitType,
  type LocalDate,
  type TargetChangeKind,
  type TargetField,
  addDays,
} from '@notch/shared';

/** What a level-up or deload changed (from a Today habit's `change` or a review's). */
export interface ChangeLike {
  kind: TargetChangeKind;
  field: TargetField;
  fromValue: number;
  toValue: number;
}

/** The habit's type and unit, to say the values in its terms. */
export interface HabitUnits {
  type: HabitType;
  unit: string | null;
}

function number(field: TargetField, habit: HabitUnits, value: number): string {
  if (field === 'TIMES_PER_WEEK') {
    return `${value}×`;
  }
  return String(habit.type === 'DURATION' ? Math.round(value / 60) : value);
}

function suffix(field: TargetField, habit: HabitUnits): string {
  if (field === 'TIMES_PER_WEEK') {
    return ' a week';
  }
  if (habit.type === 'DURATION') {
    return ' min';
  }
  return habit.unit ? ` ${habit.unit}` : '';
}

/** One value in the habit's terms: "55 min", "3× a week", "25 pages". */
export const changeValue = (change: ChangeLike, habit: HabitUnits, value: number) =>
  `${number(change.field, habit, value)}${suffix(change.field, habit)}`;

/** "50 → 55 min", "4× → 3× a week". */
export const changeValues = (change: ChangeLike, habit: HabitUnits) =>
  `${number(change.field, habit, change.fromValue)} → ${number(change.field, habit, change.toValue)}${suffix(change.field, habit)}`;

export const changeArrow = (kind: TargetChangeKind) => (kind === 'DELOAD' ? '↓' : '↑');

/** The decision behind an automatic change: two strong weeks up, a tough one down. */
export const reasonForKind = (kind: TargetChangeKind) =>
  DECISION_REASON_TEXT[kind === 'DELOAD' ? 'STRUGGLING' : 'CONSISTENT'];

/** "Target moved from 50 to 55 min." */
export const movedText = (change: ChangeLike, habit: HabitUnits) =>
  `Target moved from ${number(change.field, habit, change.fromValue)} to ${changeValue(change, habit, change.toValue)}.`;

/** Plan 14's undo confirmation: "Back to 10 min. We'll check again next week." */
export const undoneMessage = (change: ChangeLike, habit: HabitUnits) =>
  `Back to ${changeValue(change, habit, change.fromValue)}. We'll check again next week.`;

const percent = (rate: number) => `${Math.round(rate * 100)}%`;

/** "25% last week · 100% the week before", or null without either. */
export function ratesText(rate: number | null, previousRate: number | null): string | null {
  const parts = [
    rate !== null && `${percent(rate)} last week`,
    previousRate !== null && `${percent(previousRate)} the week before`,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : null;
}

/**
 * "Week of Nov 9 – 15" (en-US) or "Week of 9–15 Nov" (en-GB): the locale's own way to write a
 * range, across a month too ("Oct 27 – Nov 2").
 */
export function weekRangeTitle(weekStart: LocalDate): string {
  const day = (date: LocalDate) => new Date(`${date}T00:00:00Z`);
  const range = new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).formatRange(day(weekStart), day(addDays(weekStart, 6)));
  return `Week of ${range}`;
}

/** "Your week is in. 2 targets went up, 1 eased off." with the counts from the review. */
export function reviewSummaryText(changes: readonly { kind: string }[] | undefined): string {
  const up = changes?.filter((change) => change.kind === 'LEVEL_UP').length ?? 0;
  const down = changes?.filter((change) => change.kind === 'DELOAD').length ?? 0;
  const parts = [
    up > 0 && `${up} ${up === 1 ? 'target' : 'targets'} went up`,
    down > 0 && `${down} eased off`,
  ].filter(Boolean);
  return parts.length > 0 ? `Your week is in. ${parts.join(', ')}.` : 'Your week is in.';
}
