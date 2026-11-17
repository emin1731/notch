import { describe, expect, it } from 'vitest';
import { type GoalStatus, goalProgress, nextGoalStatus } from './goal-progress.js';

describe('goalProgress', () => {
  it('has no percentage without milestones', () => {
    expect(goalProgress([])).toEqual({ done: 0, total: 0, progress: null });
  });

  it('counts ticked milestones', () => {
    const ticked = { completedAt: new Date() };
    const open = { completedAt: null };
    expect(goalProgress([ticked, open, open, ticked])).toEqual({
      done: 2,
      total: 4,
      progress: 0.5,
    });
    expect(goalProgress([ticked])).toEqual({ done: 1, total: 1, progress: 1 });
  });
});

describe('nextGoalStatus', () => {
  it.each<[string, GoalStatus, number, number, GoalStatus]>([
    ['ticking the last open milestone completes the goal', 'ACTIVE', 3, 3, 'COMPLETED'],
    ['a partly ticked goal stays active', 'ACTIVE', 2, 3, 'ACTIVE'],
    ['unticking reopens a completed goal', 'COMPLETED', 2, 3, 'ACTIVE'],
    ['adding a milestone reopens a completed goal', 'COMPLETED', 3, 4, 'ACTIVE'],
    ['deleting the last open milestone completes the goal', 'ACTIVE', 2, 2, 'COMPLETED'],
    ['a completed goal with everything ticked stays completed', 'COMPLETED', 2, 2, 'COMPLETED'],
    ['no milestones left keeps an active goal active', 'ACTIVE', 0, 0, 'ACTIVE'],
    ['no milestones left keeps a completed goal completed', 'COMPLETED', 0, 0, 'COMPLETED'],
  ])('%s', (_name, current, done, total, expected) => {
    expect(nextGoalStatus(current, done, total)).toBe(expected);
  });
});
