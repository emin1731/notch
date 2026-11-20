import type { HabitType, ScheduleType } from '@notch/shared';
import { CircleCheck, Hash, Timer } from 'lucide-react';

/** The choices the habit forms offer (the full form and onboarding's compact one). */
export const TYPES = [
  { value: 'TOGGLE', label: 'Yes / no', icon: CircleCheck },
  { value: 'COUNT', label: 'Count', icon: Hash },
  { value: 'DURATION', label: 'Duration', icon: Timer },
] as const satisfies readonly { value: HabitType; label: string; icon: typeof Hash }[];

export const TYPE_HINTS: Record<HabitType, string> = {
  TOGGLE: 'Done or not, like taking vitamins.',
  COUNT: 'A number each time, like pages read or glasses of water.',
  DURATION: 'Time spent, like 20 minutes of meditation.',
};

export const SCHEDULES = [
  { value: 'DAILY', label: 'Every day' },
  { value: 'SPECIFIC_DAYS', label: 'Some days' },
  { value: 'TIMES_PER_WEEK', label: 'Times a week' },
] as const satisfies readonly { value: ScheduleType; label: string }[];

/** A number field's text: empty is null (no value yet). */
export const parseNumber = (text: string) => (text.trim() === '' ? null : Number(text));
