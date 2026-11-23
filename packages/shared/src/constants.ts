/** Core colors are tokens from this palette; the web app maps each to its shades. */
export const COLOR_PALETTE = [
  'emerald',
  'sky',
  'violet',
  'rose',
  'amber',
  'teal',
  'indigo',
  'orange',
  'lime',
  'slate',
] as const;
export type CoreColor = (typeof COLOR_PALETTE)[number];

/** Offered during onboarding. Icons are lucide names. */
export const CORE_PRESETS = [
  { name: 'Health', color: 'emerald', icon: 'heart-pulse' },
  { name: 'Career', color: 'indigo', icon: 'briefcase' },
  { name: 'Mind', color: 'violet', icon: 'brain' },
  { name: 'Relationships', color: 'rose', icon: 'users' },
  { name: 'Finance', color: 'amber', icon: 'wallet' },
  { name: 'Learning', color: 'sky', icon: 'book-open' },
] as const satisfies readonly { name: string; color: CoreColor; icon: string }[];

export const LIMITS = {
  orderIds: 200,
  batchCores: 20,
} as const;
