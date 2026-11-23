import {
  addDays,
  type HabitStatsDto,
  type HeatmapDay,
  type LocalDate,
  type StatsOverviewDto,
  type TargetChangeDto,
} from '@notch/shared';
import { http, HttpResponse } from 'msw';
import { API, apiError } from './auth';
import { server } from './server';
import { nextId } from './structure-api';

export function statsOverview(fields: Partial<StatsOverviewDto> = {}): StatsOverviewDto {
  return {
    range: '30d',
    from: '2026-10-21',
    to: '2026-11-19',
    overallRate: 0.9,
    daily: [],
    cores: [],
    topStreaks: [],
    changes: { levelUps: 0, deloads: 0 },
    ...fields,
  };
}

/** `count` days ending on `to`, each from `day(date, index)` (the oldest first). */
export function heatmapDays(
  to: LocalDate,
  count: number,
  day: (date: LocalDate, index: number) => Partial<HeatmapDay> = () => ({}),
): HeatmapDay[] {
  return Array.from({ length: count }, (_, index) => {
    const date = addDays(to, index - count + 1);
    return { date, value: 0, target: 1, hit: false, scheduled: true, ...day(date, index) };
  });
}

export function habitStats(
  fields: Partial<HabitStatsDto> & Pick<HabitStatsDto, 'habitId'>,
): HabitStatsDto {
  const heatmap = fields.heatmap ?? [];
  return {
    range: '30d',
    from: heatmap[0]?.date ?? '2026-10-21',
    to: heatmap[heatmap.length - 1]?.date ?? '2026-11-19',
    rate: null,
    hits: 0,
    occurrences: 0,
    currentStreak: 0,
    longestStreak: 0,
    totalValue: 0,
    heatmap,
    field: 'TARGET_VALUE',
    targetSeries: [{ date: heatmap[0]?.date ?? '2026-10-21', target: 1 }],
    ...fields,
  };
}

export function targetChange(
  fields: Partial<TargetChangeDto> & Pick<TargetChangeDto, 'habitId' | 'effectiveFrom'>,
): TargetChangeDto {
  return {
    id: nextId(),
    kind: 'LEVEL_UP',
    field: 'TARGET_VALUE',
    fromValue: 20,
    toValue: 22,
    undoDeadline: null,
    undoneAt: null,
    createdAt: `${fields.effectiveFrom}T06:00:00.000Z`,
    ...fields,
  };
}

/**
 * `/stats/overview`, `/stats/habits/:id` and `/habits/:id/target-history` over mutable fixtures:
 * `overview` and `habits` may be functions of the range, so a range switch can show new numbers.
 * Records every range asked for.
 */
export function mockStatsApi({
  overview = statsOverview(),
  habits = {},
  history = {},
}: {
  overview?: StatsOverviewDto | ((range: string) => StatsOverviewDto);
  habits?: Record<string, HabitStatsDto | ((range: string) => HabitStatsDto)>;
  history?: Record<string, TargetChangeDto[]>;
} = {}) {
  const ranges: string[] = [];
  const state = { overview, habits, history, failOverview: 0 };
  const rangeOf = (request: Request) => {
    const range = new URL(request.url).searchParams.get('range') ?? '30d';
    ranges.push(range);
    return range;
  };
  server.use(
    http.get(`${API}/stats/overview`, ({ request }) => {
      const range = rangeOf(request);
      if (state.failOverview > 0) {
        state.failOverview -= 1;
        return apiError(500, 'INTERNAL', 'Something went wrong');
      }
      const data = state.overview;
      return HttpResponse.json(typeof data === 'function' ? data(range) : data);
    }),
    http.get(`${API}/stats/habits/:id`, ({ request, params }) => {
      const range = rangeOf(request);
      const data = state.habits[params.id as string];
      if (!data) {
        return apiError(404, 'HABIT_NOT_FOUND', 'Habit not found');
      }
      return HttpResponse.json(typeof data === 'function' ? data(range) : data);
    }),
    http.get(`${API}/habits/:id/target-history`, ({ params }) =>
      HttpResponse.json(state.history[params.id as string] ?? []),
    ),
  );
  return {
    state,
    ranges,
    /** The next `times` overview requests fail with a 500. */
    failOverview: (times = 1) => {
      state.failOverview = times;
    },
  };
}
