import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import {
  type Created,
  type DraftCore,
  type DraftGoal,
  type DraftHabit,
  NOTHING_CREATED,
} from './onboarding-model';

interface OnboardingState {
  /** Whose draft this is: another user starts fresh. */
  userId: string | null;
  step: number;
  cores: DraftCore[];
  goal: DraftGoal | null;
  habits: DraftHabit[];
  created: Created;
  /** Starts (or resumes) `userId`'s onboarding. */
  begin: (userId: string) => void;
  setStep: (step: number) => void;
  addCore: (core: DraftCore) => void;
  updateCore: (key: string, fields: Omit<DraftCore, 'key' | 'preset'>) => void;
  /** Takes the core's habits, and the goal if it was in it, with it. */
  removeCore: (key: string) => void;
  setGoal: (goal: DraftGoal | null) => void;
  addHabit: (habit: DraftHabit) => void;
  removeHabit: (key: string) => void;
  setCreated: (created: Created) => void;
  reset: () => void;
}

const EMPTY = {
  userId: null,
  step: 0,
  cores: [],
  goal: null,
  habits: [],
  created: NOTHING_CREATED,
} satisfies Partial<OnboardingState>;

export const ONBOARDING_STORAGE_KEY = 'notch-onboarding';

/**
 * The onboarding draft and what's already been created, in sessionStorage: a reload keeps the
 * user's picks, and a retry knows what not to create again.
 */
export const useOnboarding = create<OnboardingState>()(
  persist(
    (set, get) => ({
      ...EMPTY,
      begin: (userId) => {
        if (get().userId !== userId) {
          set({ ...EMPTY, userId });
        }
      },
      setStep: (step) => set({ step }),
      addCore: (core) => set(({ cores }) => ({ cores: [...cores, core] })),
      updateCore: (key, fields) =>
        set(({ cores }) => ({
          cores: cores.map((core) => (core.key === key ? { ...core, ...fields } : core)),
        })),
      removeCore: (key) =>
        set(({ cores, habits, goal }) => ({
          cores: cores.filter((core) => core.key !== key),
          habits: habits.filter((habit) => habit.coreKey !== key),
          goal: goal?.coreKey === key ? null : goal,
        })),
      setGoal: (goal) => set({ goal }),
      addHabit: (habit) => set(({ habits }) => ({ habits: [...habits, habit] })),
      removeHabit: (key) => set(({ habits }) => ({ habits: habits.filter((h) => h.key !== key) })),
      setCreated: (created) => set({ created }),
      reset: () => set(EMPTY),
    }),
    {
      name: ONBOARDING_STORAGE_KEY,
      storage: createJSONStorage(() => sessionStorage),
      partialize: ({ userId, step, cores, goal, habits, created }) => ({
        userId,
        step,
        cores,
        goal,
        habits,
        created,
      }),
    },
  ),
);
