import { COLOR_PALETTE, CORE_PRESETS, type CreateCoreInput } from '@notch/shared';
import { Check, Lock, Pencil, Plus, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { CoreIcon } from '@/components/CoreIcon';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useCompleteOnboarding } from '@/features/auth/hooks';
import { CoreForm } from '@/features/cores/CoreForm';
import { useCores } from '@/features/cores/hooks';
import { apiErrorMessage } from '@/lib/forms';
import { ONBOARDING_COPY } from './copy';
import { type DraftCore, presetKey } from './onboarding-model';
import { useOnboarding } from './onboarding-store';
import { FailureAlert, StepFooter, StepHeader, type StepProps } from './StepParts';

const copy = ONBOARDING_COPY.cores;

type Editing = { mode: 'new' } | { mode: 'edit'; core: DraftCore } | null;

/** Step 1: the presets as toggles, plus cores of your own. At least one is needed. */
export function StepCores(props: StepProps) {
  const { cores, created, addCore, updateCore, removeCore, setStep } = useOnboarding();
  const [editing, setEditing] = useState<Editing>(null);
  const existing = useCores(false);
  const complete = useCompleteOnboarding();
  const saved = (key: string) => created.cores[key] !== undefined;
  const nothingCreated = Object.keys(created.cores).length === 0;

  const togglePreset = (preset: (typeof CORE_PRESETS)[number]) => {
    const key = presetKey(preset.name);
    if (cores.some((core) => core.key === key)) {
      removeCore(key);
    } else {
      addCore({
        key,
        preset: preset.name,
        name: preset.name,
        color: preset.color,
        icon: preset.icon,
      });
    }
  };

  const save = (values: CreateCoreInput) => {
    if (editing?.mode === 'edit') {
      updateCore(editing.core.key, values);
    } else {
      addCore({ key: `custom:${crypto.randomUUID()}`, preset: null, ...values });
    }
    setEditing(null);
  };

  return (
    <section className="flex flex-col gap-6" aria-labelledby="step-title">
      <StepHeader title={copy.title}>{copy.intro}</StepHeader>
      <FailureAlert {...props} />

      {nothingCreated && existing.data && existing.data.length > 0 && (
        <Alert>
          <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>{copy.alreadySetUp(existing.data.length)}</span>
            <Button
              variant="outline"
              size="sm"
              disabled={complete.isPending}
              onClick={() =>
                complete.mutate(undefined, {
                  onSuccess: () => useOnboarding.getState().reset(),
                  onError: (error) => toast.error(apiErrorMessage(error)),
                })
              }
            >
              I’m already set up
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap gap-2" role="group" aria-label="Suggested cores">
        {CORE_PRESETS.map((preset) => {
          const key = presetKey(preset.name);
          const on = cores.some((core) => core.key === key);
          return (
            <Button
              key={preset.name}
              type="button"
              variant={on ? 'default' : 'surface'}
              aria-pressed={on}
              disabled={saved(key)}
              onClick={() => togglePreset(preset)}
            >
              <CoreIcon icon={preset.icon} color={preset.color} size="sm" className="-ml-1" />
              {preset.name}
              {on && <Check aria-hidden="true" />}
            </Button>
          );
        })}
        <Button type="button" variant="surface" onClick={() => setEditing({ mode: 'new' })}>
          <Plus />
          Add your own
        </Button>
      </div>

      {cores.length > 0 && (
        <ul className="flex flex-col divide-y rounded-3xl bg-card px-2" aria-label="Your cores">
          {cores.map((core) => (
            <li key={core.key} className="flex items-center gap-3 px-4 py-3">
              <CoreIcon icon={core.icon} color={core.color} />
              <span className="min-w-0 flex-1 truncate font-medium">{core.name}</span>
              {saved(core.key) ? (
                <span className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Lock className="size-3.5" aria-hidden="true" />
                  Saved
                </span>
              ) : (
                <>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Edit ${core.name}`}
                    onClick={() => setEditing({ mode: 'edit', core })}
                  >
                    <Pencil />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove ${core.name}`}
                    onClick={() => removeCore(core.key)}
                  >
                    <X />
                  </Button>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      <StepFooter>
        {cores.length === 0 && (
          <span className="text-sm text-muted-foreground">{copy.needOne}</span>
        )}
        <Button disabled={cores.length === 0} onClick={() => setStep(1)}>
          Next
        </Button>
      </StepFooter>

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing?.mode === 'edit' ? 'Edit core' : 'Your own core'}</DialogTitle>
            <DialogDescription>
              Name it, and pick a color and an icon. You can change them later.
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <CoreForm
              initial={
                editing.mode === 'edit'
                  ? { name: editing.core.name, color: editing.core.color, icon: editing.core.icon }
                  : {
                      name: '',
                      // A color the other cores don't have yet, so it stands apart from them.
                      color:
                        COLOR_PALETTE.find((c) => !cores.some((core) => core.color === c)) ??
                        'slate',
                      icon: 'target',
                    }
              }
              presets={false}
              submitLabel={editing.mode === 'edit' ? 'Save' : 'Add core'}
              onSubmit={save}
            />
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
