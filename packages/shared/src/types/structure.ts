import type { CoreColor } from '../constants.js';

export interface CoreDto {
  id: string;
  name: string;
  color: CoreColor;
  icon: string;
  sortOrder: number;
  archivedAt: string | null;
  /** Non-archived habits. */
  counts: { habits: number };
}
