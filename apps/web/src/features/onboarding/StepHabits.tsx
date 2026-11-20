import { HABIT_TEMPLATES } from '@notch/shared';
import { Check, Lock, Plus, X } from 'lucide-react';
import { useState } from 'react';
import { CoreChip } from '@/components/CoreChip';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { CompactHabitForm } from './CompactHabitForm';
import { ONBOARDING_COPY } from './copy';
import { SOFT_HABIT_LIMIT, templateKey, templateSummary } from './onboarding-model';
import { useOnboarding } from './onboarding-store';
import { FailureAlert, StepFooter, StepHeader, type StepProps } from './StepParts';

const copy = ONBOARDING_COPY.habits;

/** Step 3: suggestions for each picked preset, plus habits of your own. */
export function StepHabits(props: StepProps) {
  const { cores, habits, created, addHabit, removeHabit, setStep } = useOnboarding();
  const [adding, setAdding] = useState<string | null>(null);
  const saved = (key: string) => created.habits[key] !== undefined;

  return (
    <section className="flex flex-col gap-6" aria-labelledby="step-title">
      <StepHeader title={copy.title}>{copy.intro}</StepHeader>
      <FailureAlert {...props} />

      <div className="flex flex-col gap-4">
        {cores.map((core) => {
          const templates = core.preset ? HABIT_TEMPLATES[core.preset] : [];
          const own = habits.filter((habit) => habit.coreKey === core.key && !habit.fromTemplate);
          return (
            <section
              key={core.key}
              aria-label={core.name}
              className="flex flex-col gap-3 rounded-3xl bg-card p-5"
            >
              <CoreChip name={core.name} icon={core.icon} color={core.color} />
              {templates.length > 0 && (
                <div
                  className="flex flex-wrap gap-2"
                  role="group"
                  aria-label={`Suggestions for ${core.name}`}
                >
                  {templates.map((template) => {
                    const key = templateKey(core.key, template.name);
                    const on = habits.some((habit) => habit.key === key);
                    return (
                      <Button
                        key={key}
                        type="button"
                        variant={on ? 'default' : 'secondary'}
                        aria-pressed={on}
                        disabled={saved(key)}
                        onClick={() =>
                          on
                            ? removeHabit(key)
                            : addHabit({
                                key,
                                coreKey: core.key,
                                fromTemplate: true,
                                input: template,
                              })
                        }
                        className="h-auto flex-col items-start gap-0 rounded-2xl py-2"
                      >
                        <span className="flex items-center gap-1.5 font-medium">
                          {template.name}
                          {on && <Check className="size-3.5" aria-hidden="true" />}
                        </span>
                        <span
                          className={cn(
                            'text-xs font-normal',
                            on ? 'text-primary-foreground/70' : 'text-muted-foreground',
                          )}
                        >
                          {templateSummary(template)}
                        </span>
                      </Button>
                    );
                  })}
                </div>
              )}
              {own.length > 0 && (
                <ul className="flex flex-col gap-1" aria-label={`Your habits in ${core.name}`}>
                  {own.map((habit) => (
                    <li
                      key={habit.key}
                      className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-1.5 text-sm"
                    >
                      <span className="min-w-0 flex-1 truncate">
                        <span className="font-medium">{habit.input.name}</span>
                        <span className="text-muted-foreground">
                          {' '}
                          · {templateSummary(habit.input)}
                        </span>
                      </span>
                      {saved(habit.key) ? (
                        <Lock className="size-3.5 text-muted-foreground" aria-label="Saved" />
                      ) : (
                        <Button
                          variant="ghost"
                          size="icon-xs"
                          aria-label={`Remove ${habit.input.name}`}
                          onClick={() => removeHabit(habit.key)}
                        >
                          <X />
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="self-start"
                onClick={() => setAdding(core.key)}
              >
                <Plus />
                Create your own
              </Button>
            </section>
          );
        })}
      </div>

      <p className="text-sm text-muted-foreground" aria-live="polite">
        {habits.length === 0
          ? 'No habits yet. You can also add them later.'
          : `${habits.length} ${habits.length === 1 ? 'habit' : 'habits'} picked.`}
      </p>
      {habits.length > SOFT_HABIT_LIMIT && (
        <Alert>
          <AlertDescription>{copy.tooMany}</AlertDescription>
        </Alert>
      )}

      <StepFooter onBack={() => setStep(1)}>
        <Button onClick={() => setStep(3)}>{habits.length === 0 ? 'Skip for now' : 'Next'}</Button>
      </StepFooter>

      <Dialog open={adding !== null} onOpenChange={(open) => !open && setAdding(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Your own habit</DialogTitle>
            <DialogDescription>
              The essentials now; levels and the time of day can be changed later.
            </DialogDescription>
          </DialogHeader>
          {adding && (
            <CompactHabitForm
              cores={cores}
              defaultCoreKey={adding}
              onAdd={({ coreKey, input }) => {
                addHabit({
                  key: `custom:${crypto.randomUUID()}`,
                  coreKey,
                  fromTemplate: false,
                  input,
                });
                setAdding(null);
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
