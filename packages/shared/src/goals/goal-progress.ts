export type GoalStatus = 'ACTIVE' | 'COMPLETED';

export interface GoalProgress {
  done: number;
  total: number;
  /** 0..1, or null for a goal without milestones (it shows no percentage). */
  progress: number | null;
}

export function goalProgress(milestones: readonly { completedAt: unknown }[]): GoalProgress {
  const total = milestones.length;
  const done = milestones.filter((milestone) => milestone.completedAt != null).length;
  return { done, total, progress: total === 0 ? null : done / total };
}

/**
 * The goal's status after any milestone change (plan 2.9):
 * all ticked → COMPLETED, any open → ACTIVE, none left → unchanged.
 * So ticking the last open milestone completes the goal, unticking or adding one reopens it,
 * and deleting the last open one completes it.
 */
export function nextGoalStatus(current: GoalStatus, done: number, total: number): GoalStatus {
  if (total === 0) {
    return current;
  }
  return done === total ? 'COMPLETED' : 'ACTIVE';
}
