import {
  type CoreDto,
  createGoalSchema,
  type GoalDetailDto,
  type GoalDto,
  LIMITS,
  milestoneTitleSchema,
} from '@notch/shared';
import { Plus, X } from 'lucide-react';
import { useId, useState } from 'react';
import { Controller } from 'react-hook-form';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { FormAlert } from '@/components/form/FormAlert';
import { TextField } from '@/components/form/TextField';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Field, FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { isApiError } from '@/lib/api-client';
import { applyServerError, useZodForm } from '@/lib/forms';
import { useCreateGoal, useUpdateGoal } from './hooks';

/** The goal's fields; milestones are only added inline when creating. */
const goalFormSchema = createGoalSchema.omit({ milestones: true });

export interface GoalDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Cores the goal can belong to (the active ones). */
  cores: readonly CoreDto[];
  /** Edit this goal; create one without it. */
  goal?: GoalDto;
  /** The core a new goal starts in. */
  defaultCoreId?: string;
  onSaved?: (goal: GoalDetailDto) => void;
}

export function GoalDialog({ open, onOpenChange, ...props }: GoalDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        {open && <GoalForm {...props} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function GoalForm({
  cores,
  goal,
  defaultCoreId,
  onSaved,
  onDone,
}: Omit<GoalDialogProps, 'open' | 'onOpenChange'> & { onDone: () => void }) {
  const create = useCreateGoal();
  const update = useUpdateGoal();
  const form = useZodForm(goalFormSchema, {
    defaultValues: {
      coreId: goal?.coreId ?? defaultCoreId ?? cores[0]?.id ?? '',
      title: goal?.title ?? '',
      description: goal?.description ?? undefined,
      deadline: goal?.deadline ?? undefined,
    },
  });
  const [milestones, setMilestones] = useState<string[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [moveHabits, setMoveHabits] = useState<{
    count: number;
    submit: () => Promise<void>;
  } | null>(null);
  const coreSelect = useId();
  const descriptionId = useId();

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);
    const fields = { ...values, description: values.description || undefined };
    try {
      if (goal) {
        const input = {
          ...fields,
          description: fields.description ?? null,
          deadline: fields.deadline ?? null,
        };
        const save = async (confirmMove: boolean) => {
          const saved = await update.mutateAsync({
            id: goal.id,
            input: confirmMove ? { ...input, moveHabits: true } : input,
          });
          onSaved?.(saved);
          onDone();
        };
        try {
          await save(false);
        } catch (error) {
          // Moving a goal with linked habits: ask before taking them along.
          if (isApiError(error, 'GOAL_CORE_MISMATCH')) {
            const linked = error.details?.linkedHabits;
            setMoveHabits({
              count: typeof linked === 'number' ? linked : 0,
              submit: () => save(true),
            });
            return;
          }
          throw error;
        }
      } else {
        const saved = await create.mutateAsync({ ...fields, milestones });
        onSaved?.(saved);
        onDone();
      }
    } catch (error) {
      setFormError(
        applyServerError(form, error, { fields: ['coreId', 'title', 'description', 'deadline'] }),
      );
    }
  });

  const targetCore = cores.find((core) => core.id === form.watch('coreId'));

  return (
    <>
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        <DialogHeader>
          <DialogTitle>{goal ? 'Edit goal' : 'New goal'}</DialogTitle>
          <DialogDescription>
            Something you want to achieve. Break it into milestones to track your progress.
          </DialogDescription>
        </DialogHeader>

        <FieldGroup>
          <FormAlert message={formError} />
          <Controller
            control={form.control}
            name="coreId"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid || undefined}>
                <FieldLabel htmlFor={coreSelect}>Core</FieldLabel>
                <select
                  id={coreSelect}
                  {...field}
                  className="h-8 w-full rounded-lg border border-input bg-transparent px-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30"
                >
                  {cores.map((core) => (
                    <option key={core.id} value={core.id}>
                      {core.name}
                    </option>
                  ))}
                </select>
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />
          <TextField
            control={form.control}
            name="title"
            label="Title"
            autoComplete="off"
            autoFocus
          />
          <Controller
            control={form.control}
            name="description"
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid || undefined}>
                <FieldLabel htmlFor={descriptionId}>Description (optional)</FieldLabel>
                <Textarea
                  id={descriptionId}
                  name={field.name}
                  ref={field.ref}
                  value={field.value ?? ''}
                  onChange={(event) => field.onChange(event.target.value)}
                  onBlur={field.onBlur}
                  rows={3}
                  aria-invalid={fieldState.invalid || undefined}
                />
                <FieldError errors={[fieldState.error]} />
              </Field>
            )}
          />
          <TextField
            control={form.control}
            name="deadline"
            label="Deadline (optional)"
            type="date"
            parse={(text) => (text === '' ? undefined : text)}
          />
          {!goal && <MilestonesInput value={milestones} onChange={setMilestones} />}
        </FieldGroup>

        <DialogFooter>
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {form.formState.isSubmitting ? 'Saving…' : goal ? 'Save' : 'Create goal'}
          </Button>
        </DialogFooter>
      </form>

      <ConfirmDialog
        open={moveHabits !== null}
        onOpenChange={(next) => !next && setMoveHabits(null)}
        title="Move its habits too?"
        description={`${moveHabits?.count === 1 ? '1 habit is' : `${moveHabits?.count ?? 0} habits are`} linked to this goal. They'll move to ${targetCore?.name ?? 'the new core'} with it.`}
        confirmLabel="Move goal and habits"
        onConfirm={() => moveHabits?.submit() ?? Promise.resolve()}
      />
    </>
  );
}

/** Milestones typed in one by one while creating a goal. */
function MilestonesInput({
  value,
  onChange,
}: {
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const inputId = useId();
  const full = value.length >= LIMITS.milestonesPerGoal;

  const add = () => {
    const parsed = milestoneTitleSchema.safeParse(draft);
    if (!parsed.success) {
      setError(draft.trim() ? (parsed.error.issues[0]?.message ?? null) : null);
      return;
    }
    onChange([...value, parsed.data]);
    setDraft('');
    setError(null);
  };

  return (
    <Field data-invalid={error ? true : undefined}>
      <FieldLabel htmlFor={inputId}>Milestones (optional)</FieldLabel>
      {value.length > 0 && (
        <ol className="flex flex-col gap-1">
          {value.map((title, index) => (
            <li
              key={`${index}-${title}`}
              className="flex items-center gap-2 rounded-md bg-muted/50 px-2 py-1 text-sm"
            >
              <span className="w-5 text-muted-foreground tabular-nums">{index + 1}.</span>
              <span className="min-w-0 flex-1 truncate">{title}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon-xs"
                aria-label={`Remove milestone ${title}`}
                onClick={() => onChange(value.filter((_, i) => i !== index))}
              >
                <X />
              </Button>
            </li>
          ))}
        </ol>
      )}
      <div className="flex gap-2">
        <Input
          id={inputId}
          value={draft}
          disabled={full}
          placeholder={full ? 'Up to 50 milestones' : 'e.g. Run 10 km without stopping'}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              add();
            }
          }}
        />
        <Button type="button" variant="outline" onClick={add} disabled={full || !draft.trim()}>
          <Plus />
          Add
        </Button>
      </div>
      <FieldDescription>Press Enter to add each one. You can change them later.</FieldDescription>
      {error && <FieldError>{error}</FieldError>}
    </Field>
  );
}
