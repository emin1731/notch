import type { CoreColor, CoreDto } from '@notch/shared';
import type { Core } from '../generated/prisma/client.js';

export type CoreWithCounts = Core & { _count: { goals: number; habits: number } };

/** Pass to `include` so `toCoreDto` gets its counts: non-archived goals and habits only. */
export const coreCountsInclude = {
  _count: {
    select: {
      goals: { where: { archivedAt: null } },
      habits: { where: { archivedAt: null } },
    },
  },
} as const;

export function toCoreDto(core: CoreWithCounts): CoreDto {
  return {
    id: core.id,
    name: core.name,
    color: core.color as CoreColor,
    icon: core.icon,
    sortOrder: core.sortOrder,
    archivedAt: core.archivedAt?.toISOString() ?? null,
    counts: { goals: core._count.goals, habits: core._count.habits },
  };
}
