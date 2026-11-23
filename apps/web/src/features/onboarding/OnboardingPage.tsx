import { createHabitSchema } from '@notch/shared';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useAuth } from '@/features/auth/auth-context';
import { accountApi } from '@/features/auth/api';
import { startSession } from '@/features/auth/session';
import { coresApi } from '@/features/cores/api';
import { habitsApi } from '@/features/habits/api';
import { apiErrorMessage } from '@/lib/forms';
import { queryKeys } from '@/lib/query-keys';
import { cn } from '@/lib/utils';
import { ONBOARDING_COPY } from './copy';
import {
  type OnboardingApi,
  OnboardingSubmitError,
  STEP_OF_PHASE,
  type SubmitFailure,
  submitOnboarding,
} from './onboarding-model';
import { useOnboarding } from './onboarding-store';
import { StepCores } from './StepCores';
import { StepHabits } from './StepHabits';
import { StepHowItWorks } from './StepHowItWorks';

const api: OnboardingApi = {
  createCores: (cores) => coresApi.batch(cores),
  createHabit: (input) => habitsApi.create(createHabitSchema.parse(input)),
  complete: () => accountApi.completeOnboarding(),
};

/** `/onboarding`: three steps, then everything is created at once (plan 7.5). */
export default function OnboardingPage() {
  const { user } = useAuth();
  const client = useQueryClient();
  const store = useOnboarding();
  const [submitting, setSubmitting] = useState(false);
  const [failure, setFailure] = useState<SubmitFailure | null>(null);
  const { begin } = store;

  useEffect(() => {
    if (user) {
      begin(user.id);
    }
  }, [user, begin]);

  const submit = async () => {
    setSubmitting(true);
    setFailure(null);
    const { cores, habits, created, setCreated, setStep } = useOnboarding.getState();
    try {
      const done = await submitOnboarding({ cores, habits }, created, api, setCreated);
      useOnboarding.getState().reset();
      // What onboarding created replaces anything cached before; then the guard opens Today.
      await client.invalidateQueries({
        predicate: (query) => query.queryKey[0] !== queryKeys.me[0],
      });
      startSession(client, done);
    } catch (error) {
      const phase = error instanceof OnboardingSubmitError ? error.phase : 'complete';
      const cause = error instanceof OnboardingSubmitError ? error.cause : error;
      setFailure({ phase, message: apiErrorMessage(cause) });
      setStep(STEP_OF_PHASE[phase]);
      setSubmitting(false);
    }
  };

  const failed = failure && STEP_OF_PHASE[failure.phase] === store.step ? failure : null;
  const retry = { failure: failed, retrying: submitting, onRetry: () => void submit() };

  return (
    <div className="flex flex-col gap-8">
      <StepIndicator step={store.step} />
      {store.step === 0 && <StepCores {...retry} />}
      {store.step === 1 && <StepHabits {...retry} />}
      {store.step === 2 && (
        <StepHowItWorks {...retry} submitting={submitting} onStart={() => void submit()} />
      )}
    </div>
  );
}

function StepIndicator({ step }: { step: number }) {
  return (
    <nav aria-label="Setup steps">
      <p className="mb-2 text-sm text-muted-foreground">
        Step {step + 1} of {ONBOARDING_COPY.steps.length}
      </p>
      <ol className="grid grid-cols-3 gap-2">
        {ONBOARDING_COPY.steps.map((title, index) => (
          <li key={title} aria-current={index === step ? 'step' : undefined}>
            <div
              className={cn(
                'h-1.5 rounded-full bg-muted transition-colors',
                index <= step && 'bg-primary',
              )}
            />
            <span
              className={cn(
                'mt-1.5 hidden text-xs sm:block',
                index === step ? 'font-medium text-foreground' : 'text-muted-foreground',
              )}
            >
              {title}
            </span>
          </li>
        ))}
      </ol>
    </nav>
  );
}
