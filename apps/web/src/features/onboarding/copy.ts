/** Onboarding's words (plan 7.5 and section 14). */
export const ONBOARDING_COPY = {
  steps: ['Your cores', 'First habits', 'How it works'],
  cores: {
    title: 'What do you want to grow in?',
    intro:
      'Cores are the areas of your life you want to work on. Pick a few, or make your own. Your habits live in them.',
    needOne: 'Pick at least one core to continue.',
    alreadySetUp: (count: number) =>
      `You already have ${count} ${count === 1 ? 'core' : 'cores'}. Skip the setup and go to Today.`,
  },
  habits: {
    title: 'Your first habits',
    intro:
      'Habits are what you do day to day. Two or three is a good start: pick from the suggestions or make your own.',
    tooMany: 'Starting small makes it stick. You can add more anytime.',
  },
  howItWorks: {
    title: 'How levels work',
    body: 'With Levels on, a habit’s target follows how your weeks go. They start off, and you choose which habits get them.',
    points: [
      'Switch Levels on from a habit’s edit page, whenever you’re ready.',
      'Every Monday, notch looks back. Two strong weeks in a row: the target moves up a step.',
      'A rough week: it eases off, so you can rebuild. This isn’t a step back.',
      'Every change shows on Today, with an Undo while you haven’t logged at the new target.',
    ],
  },
  failed: {
    cores: 'Couldn’t save your cores.',
    habits: 'Couldn’t save your habits.',
    complete: 'Couldn’t finish the setup.',
  },
  saved: 'Saved. You can change it later in Cores.',
} as const;
