/** Today's words: plan section 14's progress, backfill and saving moments. */
export const TODAY_COPY = {
  progress: {
    none: 'Fresh day. Start with the easiest one.',
    started: "Momentum's started. Keep it going.",
    halfway: 'More than halfway. Finish strong.',
    done: "Everything done. That's how it's built.",
  },
  backfill: (day: string) => `Logging for ${day}.`,
  backfillEarlierWeek: (day: string) => `Logging for ${day}. Last week's review won't change.`,
  saveFailed: "Couldn't save that. Check your connection and try again.",
} as const;
