/** ISO weekdays (Mon = 1 … Sun = 7) ↔ a bitmask (Mon = 1, Tue = 2, … Sun = 64). */
export function daysToMask(days: readonly number[]): number {
  return days.reduce((mask, day) => mask | (1 << (day - 1)), 0);
}

export function maskToDays(mask: number): number[] {
  return [1, 2, 3, 4, 5, 6, 7].filter((day) => (mask & (1 << (day - 1))) !== 0);
}
