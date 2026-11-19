import type {
  HabitDto,
  ReviewChangeDto,
  ReviewDto,
  UndoBlockReason,
  WeeklyReviewSummary,
} from '@notch/shared';
import { http, HttpResponse } from 'msw';
import { API, apiError } from './auth';
import { server } from './server';
import { fakeHabit, nextId } from './structure-api';

export function reviewChange(
  fields: Partial<ReviewChangeDto> & Pick<ReviewChangeDto, 'habitId' | 'habitName'>,
): ReviewChangeDto {
  return {
    id: nextId(),
    kind: 'DELOAD',
    field: 'TARGET_VALUE',
    fromValue: 3600,
    toValue: 3300,
    effectiveFrom: '2026-11-16',
    undoDeadline: '2026-11-22T20:00:00.000Z',
    undoneAt: null,
    createdAt: '2026-11-16T06:00:00.000Z',
    canUndo: true,
    undoBlockedReason: null,
    ...fields,
  };
}

export function review(
  fields: Partial<ReviewDto> & { weekStart: string; habits?: WeeklyReviewSummary['habits'] },
): ReviewDto {
  const { habits = [], ...rest } = fields;
  return {
    id: nextId(),
    inactive: false,
    seenAt: null,
    createdAt: `${fields.weekStart}T00:00:00.000Z`,
    changes: [],
    summary: { weekStart: fields.weekStart, overallRate: 0.8, habits },
    ...rest,
  };
}

/**
 * `/reviews` over in-memory reviews (newest first): seen, undo, and paging (2 per page here).
 * `onUndo` lets a test reflect an undo elsewhere (e.g. drop Today's badge).
 */
export function mockReviewsApi(
  reviews: ReviewDto[],
  options: {
    onSeen?: (review: ReviewDto) => void;
    onUndo?: (change: ReviewChangeDto) => void;
  } = {},
) {
  const calls: { method: string; path: string }[] = [];
  const refusals = new Map<string, UndoBlockReason>();
  const pageSize = 2;
  const find = (weekStart: string) =>
    reviews.find((candidate) => candidate.weekStart === weekStart);

  server.use(
    http.get(`${API}/reviews/latest`, () => {
      calls.push({ method: 'GET', path: '/reviews/latest' });
      return HttpResponse.json({ review: reviews[0] ?? null });
    }),
    http.get(`${API}/reviews`, ({ request }) => {
      const cursor = new URL(request.url).searchParams.get('cursor');
      const from = cursor ? reviews.findIndex((candidate) => candidate.weekStart < cursor) : 0;
      const items = from === -1 ? [] : reviews.slice(from, from + pageSize);
      const next = reviews[from + pageSize] ? items.at(-1)!.weekStart : null;
      calls.push({ method: 'GET', path: `/reviews?cursor=${cursor ?? ''}` });
      return HttpResponse.json({ items, nextCursor: next });
    }),
    http.get(`${API}/reviews/:weekStart`, ({ params }) => {
      const found = find(String(params.weekStart));
      return found ? HttpResponse.json(found) : apiError(404, 'REVIEW_NOT_FOUND');
    }),
    http.post(`${API}/reviews/:id/seen`, ({ params }) => {
      calls.push({ method: 'POST', path: `/reviews/${params.id}/seen` });
      const found = reviews.find((candidate) => candidate.id === params.id)!;
      found.seenAt ??= '2026-11-19T08:00:00.000Z';
      options.onSeen?.(found);
      return HttpResponse.json(found);
    }),
    http.post(`${API}/target-changes/:id/undo`, ({ params }) => {
      calls.push({ method: 'POST', path: `/target-changes/${params.id}/undo` });
      const change = reviews
        .flatMap((candidate) => candidate.changes)
        .find((c) => c.id === params.id);
      const refusal = refusals.get(String(params.id));
      if (refusal || !change) {
        return apiError(409, 'UNDO_NOT_ALLOWED', 'Undo not allowed', { reason: refusal });
      }
      change.undoneAt = '2026-11-19T08:00:00.000Z';
      change.canUndo = false;
      change.undoBlockedReason = 'ALREADY_UNDONE';
      options.onUndo?.(change);
      const habit: HabitDto = fakeHabit({
        id: change.habitId,
        coreId: 'core-1',
        name: change.habitName,
        targetValue: change.fromValue,
      });
      return HttpResponse.json({ change, habit });
    }),
  );

  return {
    calls,
    /** The next undo of this change is refused with `reason`. */
    refuse: (changeId: string, reason: UndoBlockReason) => refusals.set(changeId, reason),
    count: (path: string) => calls.filter((call) => call.path === path).length,
  };
}
