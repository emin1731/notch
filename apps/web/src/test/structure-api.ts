/* eslint-disable @typescript-eslint/no-explicit-any -- request bodies in a test fake */
import {
  adaptiveApplicable,
  type CoreColor,
  type CoreDto,
  type HabitDetailDto,
  type HabitDto,
} from '@notch/shared';
import { http, HttpResponse } from 'msw';
import { API, apiError } from './auth';
import { server } from './server';

let counter = 0;
/** A fresh UUID-shaped id. */
export const nextId = () => `00000000-0000-4000-8000-${String(++counter).padStart(12, '0')}`;

export interface FakeCore {
  id: string;
  name: string;
  color: CoreColor;
  icon: string;
  archivedAt: string | null;
}

export function fakeCore(fields: Partial<FakeCore> & Pick<FakeCore, 'name'>): FakeCore {
  return { id: nextId(), color: 'emerald', icon: 'heart-pulse', archivedAt: null, ...fields };
}

/** Every request the fake received, for asserting on bodies. */
export interface Call {
  method: string;
  path: string;
  body: unknown;
}

/**
 * The cores and habits API over in-memory state, close enough to the real rules for the pages'
 * tests. `fail` makes the next matching request fail with the given error.
 */
export function fakeHabit(fields: Partial<HabitDto> & Pick<HabitDto, 'coreId' | 'name'>): HabitDto {
  const habit: HabitDto = {
    id: nextId(),
    type: 'TOGGLE',
    unit: null,
    targetValue: 1,
    initialTargetValue: 1,
    scheduleType: 'DAILY',
    daysOfWeek: [],
    timesPerWeek: null,
    intervalDays: (fields.scheduleType ?? 'DAILY') === 'DAILY' ? 1 : null,
    initialTimesPerWeek: null,
    timeOfDay: 'ANYTIME',
    adaptiveEnabled: true,
    adaptiveApplicable: false,
    stepType: 'PERCENT',
    stepValue: 10,
    minTarget: null,
    maxTarget: null,
    longestStreak: 0,
    startDate: '2026-11-01',
    sortOrder: 0,
    archivedAt: null,
    ...fields,
  };
  return { ...habit, adaptiveApplicable: adaptiveApplicable(habit) };
}

export function mockStructureApi(initial: { cores?: FakeCore[]; habits?: HabitDto[] } = {}) {
  const state = {
    cores: [...(initial.cores ?? [])],
    habits: [...(initial.habits ?? [])],
  };
  const calls: Call[] = [];
  const failures: { method: string; path: RegExp; response: () => Response }[] = [];

  const coreDto = (core: FakeCore, index: number): CoreDto => ({
    ...core,
    sortOrder: index,
    counts: {
      habits: state.habits.filter((h) => h.coreId === core.id && !h.archivedAt).length,
    },
  });

  const record = async (request: Request) => {
    const url = new URL(request.url);
    const text = request.method === 'GET' ? '' : await request.clone().text();
    calls.push({
      method: request.method,
      path: url.pathname.replace(API, ''),
      body: text ? JSON.parse(text) : undefined,
    });
    const index = failures.findIndex(
      (failure) => failure.method === request.method && failure.path.test(url.pathname),
    );
    return index === -1 ? undefined : failures.splice(index, 1)[0]!.response();
  };
  const route = <Params extends Record<string, string>>(
    method: 'get' | 'post' | 'put' | 'patch' | 'delete',
    path: string,
    handle: (args: { params: Params; body: any; url: URL }) => Response | Promise<Response>,
  ) =>
    http[method](`${API}${path}`, async ({ request, params }) => {
      const failure = await record(request);
      if (failure) {
        return failure;
      }
      const text = method === 'get' ? '' : await request.text();
      return handle({
        params: params as Params,
        body: text ? JSON.parse(text) : undefined,
        url: new URL(request.url),
      });
    });

  const habitDetail = (habit: HabitDto): HabitDetailDto => ({
    ...habit,
    currentStreak: 0,
    recentChanges: [],
  });
  const findHabit = (id: string) => state.habits.find((habit) => habit.id === id);

  server.use(
    route('get', '/habits', ({ url }) => {
      const all = url.searchParams.get('includeArchived') === 'true';
      return HttpResponse.json(state.habits.filter((habit) => all || !habit.archivedAt));
    }),
    route('put', '/habits/order', ({ body }) => {
      const ids: string[] = body.ids;
      const listed = ids.map((id) => findHabit(id)!);
      state.habits = [...listed, ...state.habits.filter((habit) => !ids.includes(habit.id))];
      return HttpResponse.json(state.habits);
    }),
    route<{ id: string }>('get', '/habits/:id', ({ params }) => {
      const habit = findHabit(params.id);
      return habit ? HttpResponse.json(habitDetail(habit)) : apiError(404, 'HABIT_NOT_FOUND');
    }),
    route('post', '/habits', ({ body }) => {
      const core = state.cores.find((candidate) => candidate.id === body.coreId);
      if (core?.archivedAt) return apiError(409, 'CORE_ARCHIVED');
      const habit = fakeHabit({
        ...body,
        initialTargetValue: body.targetValue,
        initialTimesPerWeek: body.timesPerWeek,
        startDate: body.startDate ?? '2026-11-18',
      });
      state.habits.push(habit);
      return HttpResponse.json(habitDetail(habit), { status: 201 });
    }),
    route<{ id: string }>('patch', '/habits/:id', ({ params, body }) => {
      const habit = findHabit(params.id);
      if (!habit) return apiError(404, 'HABIT_NOT_FOUND');
      Object.assign(habit, body);
      return HttpResponse.json(habitDetail(habit));
    }),
    route<{ id: string; action: string }>('post', '/habits/:id/:action', ({ params }) => {
      const habit = findHabit(params.id);
      if (!habit) return apiError(404, 'HABIT_NOT_FOUND');
      if (params.action === 'unarchive') {
        const core = state.cores.find((candidate) => candidate.id === habit.coreId);
        if (core?.archivedAt) return apiError(409, 'CORE_ARCHIVED');
      }
      habit.archivedAt = params.action === 'archive' ? '2026-11-18T09:00:00.000Z' : null;
      return HttpResponse.json(habitDetail(habit));
    }),
    route<{ id: string }>('delete', '/habits/:id', ({ params }) => {
      state.habits = state.habits.filter((habit) => habit.id !== params.id);
      return new HttpResponse(null, { status: 204 });
    }),

    route('get', '/cores', ({ url }) => {
      const all = url.searchParams.get('includeArchived') === 'true';
      return HttpResponse.json(state.cores.map(coreDto).filter((core) => all || !core.archivedAt));
    }),
    route('post', '/cores', ({ body }) => {
      const core = fakeCore(body);
      state.cores.push(core);
      return HttpResponse.json(coreDto(core, state.cores.length - 1), { status: 201 });
    }),
    route('put', '/cores/order', ({ body }) => {
      const ids: string[] = body.ids;
      const listed = ids.map((id) => state.cores.find((core) => core.id === id)!);
      state.cores = [...listed, ...state.cores.filter((core) => !ids.includes(core.id))];
      return HttpResponse.json(state.cores.map(coreDto));
    }),
    route<{ id: string }>('patch', '/cores/:id', ({ params, body }) => {
      const core = state.cores.find((candidate) => candidate.id === params.id);
      if (!core) return apiError(404, 'CORE_NOT_FOUND');
      Object.assign(core, body);
      return HttpResponse.json(coreDto(core, state.cores.indexOf(core)));
    }),
    route<{ id: string }>('post', '/cores/:id/archive', ({ params }) => {
      const core = state.cores.find((candidate) => candidate.id === params.id)!;
      core.archivedAt = '2026-11-18T09:00:00.000Z';
      for (const habit of state.habits) {
        if (habit.coreId === core.id && !habit.archivedAt) habit.archivedAt = core.archivedAt;
      }
      return HttpResponse.json(coreDto(core, state.cores.indexOf(core)));
    }),
    route<{ id: string }>('post', '/cores/:id/unarchive', ({ params }) => {
      const core = state.cores.find((candidate) => candidate.id === params.id)!;
      core.archivedAt = null;
      return HttpResponse.json(coreDto(core, state.cores.indexOf(core)));
    }),
    route<{ id: string }>('delete', '/cores/:id', ({ params }) => {
      if (state.habits.some((habit) => habit.coreId === params.id)) {
        return apiError(409, 'CORE_NOT_EMPTY', 'Move or delete its habits first');
      }
      state.cores = state.cores.filter((core) => core.id !== params.id);
      return new HttpResponse(null, { status: 204 });
    }),
  );

  return {
    state,
    calls,
    /** Requests matching `method` and `path` (e.g. "/cores/order") after the page loaded. */
    sent: (method: string, path: string | RegExp) =>
      calls.filter(
        (call) =>
          call.method === method &&
          (typeof path === 'string' ? call.path === path : path.test(call.path)),
      ),
    /** The next `method` request to a path matching `path` gets `response` instead. */
    failNext: (method: string, path: RegExp, response: () => Response) =>
      failures.push({ method, path, response }),
  };
}
