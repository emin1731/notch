import { goalTitleSchema, localDateSchema } from '@notch/shared';
import { Lock } from 'lucide-react';
import { useState } from 'react';
import { z } from 'zod';
import { SelectField } from '@/components/form/SelectField';
import { TextField } from '@/components/form/TextField';
import { Button } from '@/components/ui/button';
import { FieldGroup } from '@/components/ui/field';
import { MilestonesInput } from '@/features/goals/MilestonesInput';
import { useZodForm } from '@/lib/forms';
import { ONBOARDING_COPY } from './copy';
import { useOnboarding } from './onboarding-store';
import { FailureAlert, StepFooter, StepHeader, type StepProps } from './StepParts';

const copy = ONBOARDING_COPY.goal;

const goalDraftSchema = z.object({
  coreKey: z.string().min(1, 'Pick a core'),
  title: goalTitleSchema,
  deadline: localDateSchema.nullish(),
});

/** Step 2: one goal with its milestones, or "Skip for now". */
export function StepGoal(props: StepProps) {
  const { cores, goal, created, setGoal, setStep } = useOnboarding();
  const form = useZodForm(goalDraftSchema, {
    defaultValues: {
      coreKey: goal?.coreKey ?? cores[0]?.key ?? '',
      title: goal?.title ?? '',
      deadline: goal?.deadline ?? undefined,
    },
  });
  const [milestones, setMilestones] = useState<string[]>(goal?.milestones ?? []);

  if (created.goalId && goal) {
    return (
      <section className="flex flex-col gap-6" aria-labelledby="step-title">
        <StepHeader title={copy.title}>{copy.intro}</StepHeader>
        <div className="flex items-center gap-3 rounded-xl border px-4 py-3">
          <span className="min-w-0 flex-1 truncate font-medium">{goal.title}</span>
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <Lock className="size-3.5" aria-hidden="true" />
            Saved
          </span>
        </div>
        <StepFooter onBack={() => setStep(0)}>
          <Button onClick={() => setStep(2)}>Next</Button>
        </StepFooter>
      </section>
    );
  }

  const next = form.handleSubmit((values) => {
    setGoal({
      coreKey: values.coreKey,
      title: values.title,
      deadline: values.deadline ?? null,
      milestones,
    });
    setStep(2);
  });

  return (
    <section className="flex flex-col gap-6" aria-labelledby="step-title">
      <StepHeader title={copy.title}>{copy.intro}</StepHeader>
      <FailureAlert {...props} />
      <form id="goal-form" onSubmit={next} noValidate>
        <FieldGroup>
          <SelectField
            control={form.control}
            name="coreKey"
            label="Core"
            options={cores.map((core) => ({ value: core.key, label: core.name }))}
          />
          <TextField
            control={form.control}
            name="title"
            label="Goal"
            placeholder="e.g. Run a half marathon"
            autoComplete="off"
          />
          <TextField
            control={form.control}
            name="deadline"
            label="Deadline (optional)"
            type="date"
            parse={(text) => (text === '' ? undefined : text)}
          />
          <MilestonesInput value={milestones} onChange={setMilestones} />
        </FieldGroup>
      </form>
      <StepFooter onBack={() => setStep(0)}>
        <Button
          variant="ghost"
          onClick={() => {
            setGoal(null);
            setStep(2);
          }}
        >
          Skip for now
        </Button>
        <Button type="submit" form="goal-form">
          Next
        </Button>
      </StepFooter>
    </section>
  );
}
