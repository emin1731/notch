/* eslint-disable @typescript-eslint/no-explicit-any -- request bodies in a test fake */
import {
  type CoreColor,
  type CoreDto,
  type GoalDetailDto,
  type GoalDto,
  goalProgress,
  type LinkedHabitDto,
  type LocalDate,
  type MilestoneDto,
  nextGoalStatus,
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

export interface FakeGoal {
  id: string;
  coreId: string;
  title: string;
  description: string | null;
  deadline: LocalDate | null;
  status: 'ACTIVE' | 'COMPLETED';
  completedAt: string | null;
  archivedAt: string | null;
  milestones: MilestoneDto[];
  habits: LinkedHabitDto[];
}

export function fakeCore(fields: Partial<FakeCore> & Pick<FakeCore, 'name'>): FakeCore {
  return { id: nextId(), color: 'emerald', icon: 'heart-pulse', archivedAt: null, ...fields };
}

export function fakeGoal(
  fields: Partial<Omit<FakeGoal, 'milestones'>> &
    Pick<FakeGoal, 'coreId' | 'title'> & { milestones?: (string | [string, boolean])[] },
): FakeGoal {
  const id = fields.id ?? nextId();
  const milestones = (fields.milestones ?? []).map((entry, sortOrder) => {
    const [title, done] = typeof entry === 'string' ? [entry, false] : entry;
    return {
      id: nextId(),
      goalId: id,
      title,
      sortOrder,
      completedAt: done ? '2026-11-10T09:00:00.000Z' : null,
    };
  });
  const status =
    fields.status ??
    (milestones.length > 0 && milestones.every((m) => m.completedAt) ? 'COMPLETED' : 'ACTIVE');
  return {
    description: null,
    deadline: null,
    completedAt: status === 'COMPLETED' ? '2026-11-10T09:00:00.000Z' : null,
    archivedAt: null,
    habits: [],
    ...fields,
    id,
    status,
    milestones,
  };
}

/** Every request the fake received, for asserting on bodies. */
export interface Call {
  method: string;
  path: string;
  body: unknown;
}

/**
 * The cores, goals and milestones API over in-memory state, close enough to the real rules for
 * the pages' tests. `fail` makes the next matching request fail with the given error.
 */
export function mockStructureApi(initial: { cores?: FakeCore[]; goals?: FakeGoal[] } = {}) {
  const state = { cores: [...(initial.cores ?? [])], goals: [...(initial.goals ?? [])] };
  const calls: Call[] = [];
  const failures: { method: string; path: RegExp; response: () => Response }[] = [];

  const coreDto = (core: FakeCore, index: number): CoreDto => ({
    ...core,
    sortOrder: index,
    counts: {
      goals: state.goals.filter((g) => g.coreId === core.id && !g.archivedAt).length,
      habits: 0,
    },
  });
  const goalDto = (goal: FakeGoal, index = 0): GoalDto => {
    const { done, total, progress } = goalProgress(goal.milestones);
    const { milestones: _milestones, habits: _habits, ...rest } = goal;
    return { ...rest, sortOrder: index, progress, milestoneCounts: { done, total } };
  };
  const detail = (goal: FakeGoal): GoalDetailDto => ({
    ...goalDto(goal),
    milestones: goal.milestones,
    habits: goal.habits,
  });
  const findGoal = (id: string) => state.goals.find((goal) => goal.id === id);
  const findMilestone = (id: string) => {
    for (const goal of state.goals) {
      const milestone = goal.milestones.find((m) => m.id === id);
      if (milestone) {
        return { goal, milestone };
      }
    }
    return undefined;
  };
  /** Applies plan 2.9 after a milestone change; true when it just completed the goal. */
  const settle = (goal: FakeGoal) => {
    const { done, total } = goalProgress(goal.milestones);
    const before = goal.status;
    goal.status = nextGoalStatus(goal.status, done, total);
    goal.completedAt =
      goal.status === 'COMPLETED' ? (goal.completedAt ?? new Date().toISOString()) : null;
    return before === 'ACTIVE' && goal.status === 'COMPLETED';
  };

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

  const notFound = (code: 'CORE_NOT_FOUND' | 'GOAL_NOT_FOUND' | 'MILESTONE_NOT_FOUND') =>
    apiError(404, code);

  server.use(
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
      if (!core) return notFound('CORE_NOT_FOUND');
      Object.assign(core, body);
      return HttpResponse.json(coreDto(core, state.cores.indexOf(core)));
    }),
    route<{ id: string }>('post', '/cores/:id/archive', ({ params }) => {
      const core = state.cores.find((candidate) => candidate.id === params.id)!;
      core.archivedAt = '2026-11-18T09:00:00.000Z';
      for (const goal of state.goals) {
        if (goal.coreId === core.id && !goal.archivedAt) goal.archivedAt = core.archivedAt;
      }
      return HttpResponse.json(coreDto(core, state.cores.indexOf(core)));
    }),
    route<{ id: string }>('post', '/cores/:id/unarchive', ({ params }) => {
      const core = state.cores.find((candidate) => candidate.id === params.id)!;
      core.archivedAt = null;
      return HttpResponse.json(coreDto(core, state.cores.indexOf(core)));
    }),
    route<{ id: string }>('delete', '/cores/:id', ({ params }) => {
      if (state.goals.some((goal) => goal.coreId === params.id)) {
        return apiError(409, 'CORE_NOT_EMPTY', 'Move or delete its goals and habits first');
      }
      state.cores = state.cores.filter((core) => core.id !== params.id);
      return new HttpResponse(null, { status: 204 });
    }),

    route('get', '/goals', ({ url }) => {
      const all = url.searchParams.get('includeArchived') === 'true';
      return HttpResponse.json(state.goals.filter((goal) => all || !goal.archivedAt).map(goalDto));
    }),
    route<{ id: string }>('get', '/goals/:id', ({ params }) => {
      const goal = findGoal(params.id);
      return goal ? HttpResponse.json(detail(goal)) : notFound('GOAL_NOT_FOUND');
    }),
    route('post', '/goals', ({ body }) => {
      const core = state.cores.find((candidate) => candidate.id === body.coreId);
      if (core?.archivedAt) return apiError(409, 'CORE_ARCHIVED');
      const goal = fakeGoal({ ...body, milestones: body.milestones ?? [] });
      state.goals.push(goal);
      return HttpResponse.json(detail(goal), { status: 201 });
    }),
    route<{ id: string }>('patch', '/goals/:id', ({ params, body }) => {
      const goal = findGoal(params.id);
      if (!goal) return notFound('GOAL_NOT_FOUND');
      const { moveHabits, ...fields } = body;
      if (fields.coreId && fields.coreId !== goal.coreId && goal.habits.length > 0 && !moveHabits) {
        return apiError(409, 'GOAL_CORE_MISMATCH', 'Linked habits', {
          linkedHabits: goal.habits.length,
        });
      }
      Object.assign(goal, fields);
      return HttpResponse.json(detail(goal));
    }),
    // Before /goals/:id/:action, which would match it too.
    route<{ goalId: string }>('post', '/goals/:goalId/milestones', ({ params, body }) => {
      const goal = findGoal(params.goalId)!;
      if (goal.milestones.length >= 50) return apiError(409, 'LIMIT_REACHED');
      const milestone: MilestoneDto = {
        id: nextId(),
        goalId: goal.id,
        title: body.title,
        sortOrder: goal.milestones.length,
        completedAt: null,
      };
      goal.milestones.push(milestone);
      const goalJustCompleted = settle(goal);
      return HttpResponse.json(
        { milestone, goal: goalDto(goal), goalJustCompleted },
        { status: 201 },
      );
    }),
    route<{ id: string; action: string }>('post', '/goals/:id/:action', ({ params }) => {
      const goal = findGoal(params.id);
      if (!goal) return notFound('GOAL_NOT_FOUND');
      if (params.action === 'complete') {
        goal.status = 'COMPLETED';
        goal.completedAt = new Date().toISOString();
      } else if (params.action === 'reopen') {
        goal.status = 'ACTIVE';
        goal.completedAt = null;
      } else if (params.action === 'archive') {
        goal.archivedAt = '2026-11-18T09:00:00.000Z';
      } else if (params.action === 'unarchive') {
        const core = state.cores.find((candidate) => candidate.id === goal.coreId);
        if (core?.archivedAt) return apiError(409, 'CORE_ARCHIVED');
        goal.archivedAt = null;
      }
      return HttpResponse.json(detail(goal));
    }),
    route<{ id: string }>('delete', '/goals/:id', ({ params }) => {
      state.goals = state.goals.filter((goal) => goal.id !== params.id);
      return new HttpResponse(null, { status: 204 });
    }),

    route<{ goalId: string }>('put', '/goals/:goalId/milestones/order', ({ params, body }) => {
      const goal = findGoal(params.goalId)!;
      goal.milestones = (body.ids as string[]).map((id, sortOrder) => ({
        ...goal.milestones.find((m) => m.id === id)!,
        sortOrder,
      }));
      return HttpResponse.json(goal.milestones);
    }),
    route<{ id: string }>('patch', '/milestones/:id', ({ params, body }) => {
      const found = findMilestone(params.id);
      if (!found) return notFound('MILESTONE_NOT_FOUND');
      found.milestone.title = body.title;
      return HttpResponse.json(found.milestone);
    }),
    route<{ id: string }>('post', '/milestones/:id/toggle', ({ params }) => {
      const found = findMilestone(params.id);
      if (!found) return notFound('MILESTONE_NOT_FOUND');
      found.milestone.completedAt = found.milestone.completedAt ? null : new Date().toISOString();
      const goalJustCompleted = settle(found.goal);
      return HttpResponse.json({
        milestone: found.milestone,
        goal: goalDto(found.goal),
        goalJustCompleted,
      });
    }),
    route<{ id: string }>('delete', '/milestones/:id', ({ params }) => {
      const found = findMilestone(params.id);
      if (!found) return notFound('MILESTONE_NOT_FOUND');
      found.goal.milestones = found.goal.milestones.filter((m) => m.id !== params.id);
      const goalJustCompleted = settle(found.goal);
      return HttpResponse.json({ goal: goalDto(found.goal), goalJustCompleted });
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
