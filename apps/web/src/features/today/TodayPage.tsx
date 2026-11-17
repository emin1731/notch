import { todayIn } from '@notch/shared';
import { Placeholder } from '@/components/Placeholder';

const browserTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone;

/** "Tuesday, November 17" for a local date. */
const formatDate = (date: string) =>
  new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${date}T00:00:00Z`));

export default function TodayPage() {
  // Uses the shared package's date logic in the browser; W4 takes the date from the API instead.
  const today = todayIn(browserTimeZone(), new Date());
  return <Placeholder title="Today" sprint="W4" description={formatDate(today)} />;
}
