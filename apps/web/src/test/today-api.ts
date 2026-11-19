import {
  computeProgress,
  isHit,
  type LocalDate,
  type LogWriteResult,
  maxLogValue,
  type TimeOfDay,
  type TodayHabit,
  type TodayResponse,
} from '@notch/shared';
import { delay, http, HttpResponse } from 'msw';
import { API } from './auth';
import { server } from './server';
import { nextId } from './structure-api';

export function todayHabit(fields: Partial<TodayHabit> & Pick<TodayHabit, 'name'>): TodayHabit {
  return {
    id: nextId(),
    type: 'TOGGLE',
    unit: null,
    scheduleType: 'DAILY',
    timeOfDay: 'ANYTIME',
    core: { id: 'core-1', name: 'Health', color: 'emerald', icon: 'heart-pulse' },
    goal: null,
    target: 1,
    log: null,
    progress: 0,
    currentStreak: 0,
    ...fields,
  };
}

export interface TodayCall {
  method: string;
  habitId: string;
  date: LocalDate;
  body: { value?: number; delta?: number };
  keepalive: boolean;
}

const ORDER: TimeOfDay[] = ['MORNING', 'AFTERNOON', 'EVENING', 'ANYTIME'];

/**
 * `/today` and the log routes over in-memory logs, computing progress like the API. Streaks are
 * simplified: a habit's `currentStreak` plus one while the day is a hit.
 */
export function mockTodayApi(
  habits: TodayHabit[],
  options: { date: LocalDate; writeDelayMs?: number },
) {
  const key = (habitId: string, date: string) => `${date}:${habitId}`;
  const logs = new Map<string, { value: number; targetSnapshot: number }>();
  // A habit's `log` is its log on `options.date`; its streak and week count include it.
  for (const habit of habits) {
    if (habit.log) {
      logs.set(key(habit.id, options.date), habit.log);
    }
  }
  const calls: TodayCall[] = [];
  const failures: { method: string; response: () => Response }[] = [];
  const logFor = (habit: TodayHabit, date: string) => logs.get(key(habit.id, date)) ?? null;

  const view = (habit: TodayHabit, date: string): TodayHabit => {
    const log = logFor(habit, date);
    const base = habit.currentStreak - Number(isHit(habit.log ?? undefined));
    return {
      ...habit,
      log,
      progress: log ? computeProgress(log.value, log.targetSnapshot) : 0,
      currentStreak: base + Number(isHit(log ?? undefined)),
      week: habit.week && {
        ...habit.week,
        hits:
          habit.week.hits - Number(isHit(habit.log ?? undefined)) + Number(isHit(log ?? undefined)),
      },
    };
  };

  const day = (date: string): TodayResponse => {
    const all = habits.map((habit) => view(habit, date));
    const scheduled = all.filter((habit) => habit.scheduleType !== 'TIMES_PER_WEEK');
    const groups = ORDER.map((timeOfDay) => ({
      timeOfDay,
      habits: scheduled.filter((habit) => habit.timeOfDay === timeOfDay),
    })).filter((group) => group.habits.length > 0);
    return {
      date,
      dayProgress:
        scheduled.length === 0
          ? null
          : scheduled.reduce((sum, habit) => sum + habit.progress, 0) / scheduled.length,
      pendingReview: null,
      welcomeBack: false,
      groups,
      weeklyQuota: all.filter((habit) => habit.scheduleType === 'TIMES_PER_WEEK'),
    };
  };

  const write = async (
    method: string,
    request: Request,
    params: Record<string, string | readonly string[] | undefined>,
    next: (current: number, body: TodayCall['body']) => number,
  ) => {
    const habitId = String(params.id);
    const date = String(params.date);
    const body = (await request.json()) as TodayCall['body'];
    calls.push({ method, habitId, date, body, keepalive: request.keepalive });
    if (options.writeDelayMs) {
      await delay(options.writeDelayMs);
    }
    const index = failures.findIndex((failure) => failure.method === method);
    if (index !== -1) {
      return failures.splice(index, 1)[0]!.response();
    }
    const habit = habits.find((candidate) => candidate.id === habitId)!;
    const current = logFor(habit, date);
    const value = Math.min(Math.max(next(current?.value ?? 0, body), 0), maxLogValue(habit.type));
    const log =
      value > 0 ? { value, targetSnapshot: current?.targetSnapshot ?? habit.target } : null;
    if (log) {
      logs.set(key(habitId, date), log);
    } else {
      logs.delete(key(habitId, date));
    }
    const shown = view(habit, date);
    const result: LogWriteResult = {
      log: log && { date, ...log },
      habitProgress: shown.progress,
      currentStreak: shown.currentStreak,
      longestStreak: shown.currentStreak,
    };
    return HttpResponse.json(result);
  };

  server.use(
    http.get(`${API}/today`, ({ request }) => {
      const date = new URL(request.url).searchParams.get('date') ?? '';
      calls.push({ method: 'GET', habitId: '', date, body: {}, keepalive: false });
      return HttpResponse.json(day(date));
    }),
    http.put(`${API}/habits/:id/logs/:date`, ({ request, params }) =>
      write('PUT', request, params, (_, body) => body.value ?? 0),
    ),
    http.post(`${API}/habits/:id/logs/:date/increment`, ({ request, params }) =>
      write('INCREMENT', request, params, (current, body) => current + (body.delta ?? 0)),
    ),
    http.post(`${API}/habits/:id/archive`, ({ params }) => {
      const index = habits.findIndex((habit) => habit.id === params.id);
      calls.push({
        method: 'ARCHIVE',
        habitId: String(params.id),
        date: '',
        body: {},
        keepalive: false,
      });
      habits.splice(index, 1);
      return HttpResponse.json({});
    }),
  );

  return {
    calls,
    writes: () => calls.filter((call) => call.method !== 'ARCHIVE' && call.method !== 'GET'),
    /** How many times the day was fetched. */
    fetches: (date: string) =>
      calls.filter((call) => call.method === 'GET' && call.date === date).length,
    /** The next write of this kind gets `response` instead. */
    failNext: (method: 'PUT' | 'INCREMENT', response: () => Response) =>
      failures.push({ method, response }),
    valueOf: (habitId: string, date: string) => logs.get(key(habitId, date))?.value ?? 0,
  };
}
