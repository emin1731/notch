/** Every threshold of adaptive difficulty, in one place (plan 2.7). */
export const PROGRESSION_CONFIG = {
  levelUpAtOrAbove: 0.85,
  consecutiveWeeksForLevelUp: 2,
  deloadBelow: 0.5,
  defaultStepPercent: 10,
  minIncrement: { COUNT: 1, DURATION: 60, FREQUENCY: 1 },
  defaultMinTargetRatio: 0.5,
  maxTimesPerWeek: 7,
  undoWindowDays: 7,
  backfillDays: 6,
} as const;
