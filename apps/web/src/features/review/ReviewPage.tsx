import {
  DECISION_REASON_TEXT,
  type HabitDto,
  type ReviewChangeDto,
  type ReviewDto,
  UNDO_BLOCK_REASON_TEXT,
  type WeeklyReviewSummary,
} from '@notch/shared';
import {
  ArrowDown,
  ArrowUp,
  CalendarCheck,
  ChevronRight,
  Hand,
  Lock,
  SearchX,
  TriangleAlert,
  Undo2,
} from 'lucide-react';
import { useEffect, useRef } from 'react';
import { Link, useParams } from 'react-router';
import { EmptyState } from '@/components/EmptyState';
import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useHabits } from '@/features/habits/hooks';
import { isApiError } from '@/lib/api-client';
import {
  type HabitUnits,
  changeValues,
  ratesText,
  reasonForKind,
  undoneMessage,
  weekRangeTitle,
} from '@/lib/change-format';
import { useLatestReview, useMarkSeen, useReview, useReviewList, useUndoChange } from './hooks';

/** `/review` is the latest review; `/review/:weekStart` an earlier one (plan 7.5). */
export default function ReviewPage() {
  const { weekStart } = useParams();
  return weekStart ? <WeekReview key={weekStart} weekStart={weekStart} /> : <LatestReview />;
}

function LatestReview() {
  const latest = useLatestReview();
  if (latest.isPending) {
    return <ReviewSkeleton />;
  }
  if (latest.isError) {
    return <LoadError onRetry={() => void latest.refetch()} />;
  }
  if (!latest.data.review) {
    return (
      <>
        <PageHeader title="Weekly review" />
        <EmptyState icon={CalendarCheck} title="No review yet">
          Your first review arrives after your first full week.
        </EmptyState>
      </>
    );
  }
  return <ReviewView review={latest.data.review} />;
}

function WeekReview({ weekStart }: { weekStart: string }) {
  const review = useReview(weekStart);
  if (review.isPending) {
    return <ReviewSkeleton />;
  }
  if (review.isError) {
    if (isApiError(review.error) && [400, 404].includes(review.error.status)) {
      return (
        <EmptyState
          icon={SearchX}
          title="No review for that week"
          action={
            <Button asChild variant="outline">
              <Link to="/review">Latest review</Link>
            </Button>
          }
        >
          There may have been no habits to review yet, or the link is wrong.
        </EmptyState>
      );
    }
    return <LoadError onRetry={() => void review.refetch()} />;
  }
  return <ReviewView review={review.data} />;
}

type SummaryHabit = WeeklyReviewSummary['habits'][number];

function ReviewView({ review }: { review: ReviewDto }) {
  const markSeen = useMarkSeen();
  const habits = useHabits(true);
  const marked = useRef(false);

  // Opening the review is what makes Today's banner go away.
  useEffect(() => {
    if (review.seenAt === null && !marked.current) {
      marked.current = true;
      markSeen.mutate(review.id);
    }
  }, [review.id, review.seenAt, markSeen]);

  const byId = new Map((habits.data ?? []).map((habit) => [habit.id, habit]));
  const summaryOf = (habitId: string) =>
    review.summary.habits.find((entry) => entry.habitId === habitId);
  const up = review.changes.filter((change) => change.kind === 'LEVEL_UP');
  const down = review.changes.filter((change) => change.kind === 'DELOAD');
  const changed = new Set(review.changes.map((change) => change.habitId));
  const steady = review.summary.habits.filter((entry) => !changed.has(entry.habitId));
  const overall = review.summary.overallRate;

  return (
    <>
      <PageHeader
        title={weekRangeTitle(review.weekStart)}
        description={
          !review.inactive && overall !== null
            ? `Overall ${Math.round(overall * 100)}% of what you planned.`
            : null
        }
      />

      {review.inactive ? (
        <div className="flex items-start gap-3 rounded-xl border bg-card p-4 text-sm">
          <Hand className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
          <p>You were away last week. Nothing changed. Pick up where you left off.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          {up.length > 0 && (
            <ChangeSection title="Levelled up" icon={ArrowUp}>
              {up.map((change) => (
                <ChangeCard
                  key={change.id}
                  change={change}
                  habit={byId.get(change.habitId)}
                  summary={summaryOf(change.habitId)}
                />
              ))}
            </ChangeSection>
          )}
          {down.length > 0 && (
            <ChangeSection title="Eased off" icon={ArrowDown}>
              {down.map((change) => (
                <ChangeCard
                  key={change.id}
                  change={change}
                  habit={byId.get(change.habitId)}
                  summary={summaryOf(change.habitId)}
                />
              ))}
            </ChangeSection>
          )}
          {review.changes.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No targets changed this week. Solid weeks add up: keep going.
            </p>
          )}
          {steady.length > 0 && <HoldingSteady entries={steady} />}
        </div>
      )}

      <PastReviews currentId={review.id} />
    </>
  );
}

function ChangeSection({
  title,
  icon: Icon,
  children,
}: {
  title: string;
  icon: typeof ArrowUp;
  children: React.ReactNode;
}) {
  return (
    <section aria-label={title} className="flex flex-col gap-2">
      <h2 className="flex items-center gap-2 font-medium">
        <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
        {title}
      </h2>
      {children}
    </section>
  );
}

/** Until the habits list arrives (or for a habit gone since), values are plain numbers. */
const UNKNOWN_UNITS: HabitUnits = { type: 'COUNT', unit: null };

function ChangeCard({
  change,
  habit,
  summary,
}: {
  change: ReviewChangeDto;
  habit: HabitDto | undefined;
  summary: SummaryHabit | undefined;
}) {
  const undo = useUndoChange();
  const units = habit ?? UNKNOWN_UNITS;
  const rates = summary ? ratesText(summary.rate, summary.previousRate) : null;
  return (
    <article
      aria-label={change.habitName}
      className="flex flex-col gap-2 rounded-xl border bg-card p-4 text-sm"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-medium">{change.habitName}</h3>
        <span className="font-medium tabular-nums">{changeValues(change, units)}</span>
      </div>
      <p className="text-muted-foreground">
        {reasonForKind(change.kind)}
        {rates && `. ${rates}`}.{change.kind === 'DELOAD' && " This isn't a step back."}
      </p>
      {change.undoneAt !== null ? (
        <Badge variant="secondary" className="self-start">
          Undone
        </Badge>
      ) : change.canUndo ? (
        <Button
          variant="outline"
          size="sm"
          className="self-start"
          disabled={undo.isPending}
          onClick={() => undo.mutate({ changeId: change.id, done: undoneMessage(change, units) })}
        >
          <Undo2 />
          Undo
        </Button>
      ) : (
        change.undoBlockedReason && (
          <p className="flex items-start gap-2 text-muted-foreground">
            <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            {UNDO_BLOCK_REASON_TEXT[change.undoBlockedReason]}.
          </p>
        )
      )}
    </article>
  );
}

function HoldingSteady({ entries }: { entries: readonly SummaryHabit[] }) {
  return (
    <details className="group rounded-xl border">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-sm font-medium focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none [&::-webkit-details-marker]:hidden">
        <ChevronRight
          className="size-4 transition-transform group-open:rotate-90"
          aria-hidden="true"
        />
        Holding steady ({entries.length})
      </summary>
      <ul className="flex flex-col divide-y border-t">
        {entries.map((entry) => (
          <li
            key={entry.habitId}
            className="flex items-baseline justify-between gap-3 px-4 py-2.5 text-sm"
          >
            <span className="min-w-0">
              <span className="font-medium">{entry.name}</span>
              <span className="block text-muted-foreground">
                {DECISION_REASON_TEXT[entry.reason]}
              </span>
            </span>
            {entry.rate !== null && (
              <span className="shrink-0 text-muted-foreground tabular-nums">
                {Math.round(entry.rate * 100)}%
              </span>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}

function PastReviews({ currentId }: { currentId: string }) {
  const list = useReviewList();
  const reviews = (list.data?.pages ?? [])
    .flatMap((page) => page.items)
    .filter((review) => review.id !== currentId);
  if (reviews.length === 0) {
    return null;
  }
  return (
    <section aria-label="Past reviews" className="mt-10 flex flex-col gap-2">
      <h2 className="font-medium">Past reviews</h2>
      <ul className="flex flex-col divide-y rounded-xl border">
        {reviews.map((review) => {
          const up = review.changes.filter((change) => change.kind === 'LEVEL_UP').length;
          const down = review.changes.filter((change) => change.kind === 'DELOAD').length;
          const detail = review.inactive
            ? 'A quiet week'
            : [up > 0 && `${up} up`, down > 0 && `${down} eased off`].filter(Boolean).join(' · ') ||
              'No changes';
          return (
            <li key={review.id}>
              <Link
                to={`/review/${review.weekStart}`}
                className="flex items-center justify-between gap-3 px-4 py-3 text-sm hover:bg-muted/50 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              >
                <span className="font-medium">{weekRangeTitle(review.weekStart)}</span>
                <span className="flex shrink-0 items-center gap-3 whitespace-nowrap text-muted-foreground">
                  {detail}
                  {review.summary.overallRate !== null && (
                    <span className="tabular-nums">
                      {Math.round(review.summary.overallRate * 100)}%
                    </span>
                  )}
                  <ChevronRight className="size-4" aria-hidden="true" />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      {list.hasNextPage && (
        <Button
          variant="ghost"
          size="sm"
          className="self-start"
          disabled={list.isFetchingNextPage}
          onClick={() => void list.fetchNextPage()}
        >
          {list.isFetchingNextPage ? 'Loading…' : 'Show more'}
        </Button>
      )}
    </section>
  );
}

function ReviewSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading the review">
      <Skeleton className="h-8 w-56" />
      <Skeleton className="h-24 rounded-xl" />
      <Skeleton className="h-24 rounded-xl" />
    </div>
  );
}

function LoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <EmptyState
      icon={TriangleAlert}
      title="Couldn't load the review"
      action={
        <Button variant="outline" onClick={onRetry}>
          Try again
        </Button>
      }
    >
      Check your connection and try again.
    </EmptyState>
  );
}
