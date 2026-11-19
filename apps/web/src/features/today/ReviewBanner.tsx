import type { TodayResponse } from '@notch/shared';
import { ArrowRight, CalendarCheck, Hand } from 'lucide-react';
import { Link } from 'react-router';
import { useLatestReview } from '@/features/review/hooks';
import { reviewSummaryText } from '@/lib/change-format';

/**
 * Plan 7.5: a banner linking to the unseen review, and the "welcome back" message after an
 * inactive week. Both stay until the review is opened.
 */
export function ReviewBanner({ today }: { today: TodayResponse }) {
  const pending = today.pendingReview;
  // Only while a review is waiting: its changes give the counts.
  const latest = useLatestReview({ enabled: pending !== null });
  if (!pending) {
    return null;
  }
  const changes = latest.data?.review?.id === pending.id ? latest.data.review.changes : undefined;

  return (
    <Link
      to="/review"
      className="flex items-center gap-3 rounded-xl border bg-card p-4 text-sm transition-colors hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
    >
      {today.welcomeBack ? (
        <Hand className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
      ) : (
        <CalendarCheck className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
      )}
      <span className="min-w-0 flex-1">
        {today.welcomeBack
          ? 'You were away last week. Nothing changed. Pick up where you left off.'
          : reviewSummaryText(changes)}
      </span>
      <span className="flex shrink-0 items-center gap-1 font-medium">
        See review
        <ArrowRight className="size-4" aria-hidden="true" />
      </span>
    </Link>
  );
}
