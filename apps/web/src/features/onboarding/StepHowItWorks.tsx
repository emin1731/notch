import { ArrowDown, ArrowUp, ToggleRight, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ONBOARDING_COPY } from './copy';
import { useOnboarding } from './onboarding-store';
import { FailureAlert, StepFooter, StepHeader, type StepProps } from './StepParts';

const copy = ONBOARDING_COPY.howItWorks;
const ICONS = [ToggleRight, ArrowUp, ArrowDown, Undo2];

/** Step 3: levels in plain words, then everything is created. */
export function StepHowItWorks({
  submitting,
  onStart,
  ...props
}: StepProps & { submitting: boolean; onStart: () => void }) {
  const { setStep } = useOnboarding();
  return (
    <section className="flex flex-col gap-6" aria-labelledby="step-title">
      <StepHeader title={copy.title}>{copy.body}</StepHeader>
      <FailureAlert {...props} />
      <ul className="flex flex-col gap-3">
        {copy.points.map((point, index) => {
          const Icon = ICONS[index]!;
          return (
            <li key={point} className="flex items-start gap-3 rounded-3xl bg-card p-5 text-sm">
              <Icon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              {point}
            </li>
          );
        })}
      </ul>
      <StepFooter onBack={submitting ? undefined : () => setStep(1)}>
        <Button disabled={submitting} onClick={onStart}>
          {submitting ? 'Setting up…' : 'Start'}
        </Button>
      </StepFooter>
    </section>
  );
}
