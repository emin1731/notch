import { type LocalDate, todayIn } from '@notch/shared';
import { useAuth } from '@/features/auth/auth-context';

/** Today's date in the user's timezone (not the browser's). */
export function useToday(): LocalDate {
  const { user } = useAuth();
  return todayIn(user?.timezone ?? 'UTC', new Date());
}
