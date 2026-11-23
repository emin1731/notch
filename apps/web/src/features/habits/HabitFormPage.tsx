import {
  adaptiveApplicable,
  type CoreDto,
  createHabitSchema,
  type HabitDto,
  type HabitType,
  LIMITS,
  PROGRESSION_CONFIG,
  progressingField,
  type ScheduleType,
  type StepType,
  type TimeOfDay,
} from '@notch/shared';
import { Info, SearchX, TriangleAlert } from 'lucide-react';
import { type ReactNode, useId, useState } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { toast } from 'sonner';
import { EmptyState } from '@/components/EmptyState';
import { FormAlert } from '@/components/form/FormAlert';
import { SelectField } from '@/components/form/SelectField';
import { TextField } from '@/components/form/TextField';
import { PageHeader } from '@/components/PageHeader';
import { SegmentedControl } from '@/components/SegmentedControl';
import { Stepper } from '@/components/Stepper';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { WeekdayPicker } from '@/components/WeekdayPicker';
import { useCores } from '@/features/cores/hooks';
import { isApiError } from '@/lib/api-client';
import { applyServerError } from '@/lib/forms';
import { intervalText } from '@/lib/habit-format';
import { useToday } from '@/lib/use-today';
import {
  changedFields,
  defaultValues,
  formFieldForPath,
  habitFormResolver,
  type HabitFormField,
  type HabitFormValues,
  manualChangeNote,
  minutesHint,
  previewText,
  resetForSchedule,
  resetForType,
  startDateRange,
  toHabitInput,
  valuesFromHabit,
} from './habit-form';
import { parseNumber, SCHEDULES, TYPE_HINTS, TYPES } from './habit-options';
import { useCreateHabit, useHabit, useUpdateHabit } from './hooks';

const TIMES_OF_DAY = [
  { value: 'MORNING', label: 'Morning' },
  { value: 'AFTERNOON', label: 'Afternoon' },
  { value: 'EVENING', label: 'Evening' },
  { value: 'ANYTIME', label: 'Anytime' },
] as const satisfies readonly { value: TimeOfDay; label: string }[];

/** What an edit can still change about how a habit repeats (not whether it's daily or weekly). */
const EDITABLE_SCHEDULE: Record<ScheduleType, string> = {
  DAILY: 'its interval',
  SPECIFIC_DAYS: 'its days',
  TIMES_PER_WEEK: 'its count',
};

const FIELDS: HabitFormField[] = [
  'name',
  'coreId',
  'type',
  'unit',
  'target',
  'scheduleType',
  'daysOfWeek',
  'timesPerWeek',
  'intervalDays',
  'timeOfDay',
  'stepType',
  'stepValue',
  'minTarget',
  'maxTarget',
  'startDate',
];

export default function HabitFormPage() {
  const { habitId } = useParams();
  return habitId ? <EditHabit id={habitId} /> : <NewHabit />;
}

function NewHabit() {
  const [params] = useSearchParams();
  const today = useToday();
  const cores = useCores(false);

  if (cores.isPending) {
    return <FormSkeleton title="New habit" />;
  }
  if (cores.isError) {
    return <LoadError onRetry={() => void cores.refetch()} />;
  }
  if (cores.data.length === 0) {
    return (
      <>
        <PageHeader title="New habit" />
        <EmptyState
          icon={Info}
          title="Add a core first"
          action={
            <Button asChild>
              <Link to="/cores">Go to Cores</Link>
            </Button>
          }
        >
          Every habit belongs to a core, an area of your life like health or career.
        </EmptyState>
      </>
    );
  }

  const coreId = params.get('coreId');
  const initialCore = cores.data.find((core) => core.id === coreId) ?? cores.data[0]!;
  return (
    <HabitForm cores={cores.data} initial={defaultValues({ coreId: initialCore.id, today })} />
  );
}

function EditHabit({ id }: { id: string }) {
  const habit = useHabit(id);
  const cores = useCores(true);

  if (habit.isPending || cores.isPending) {
    return <FormSkeleton title="Edit habit" />;
  }
  if (habit.isError) {
    if (isApiError(habit.error) && [400, 404].includes(habit.error.status)) {
      return (
        <EmptyState
          icon={SearchX}
          title="Habit not found"
          action={
            <Button asChild variant="outline">
              <Link to="/cores">Back to Cores</Link>
            </Button>
          }
        >
          It may have been deleted, or the link is wrong.
        </EmptyState>
      );
    }
    return <LoadError onRetry={() => void habit.refetch()} />;
  }
  if (cores.isError) {
    return <LoadError onRetry={() => void cores.refetch()} />;
  }
  // Active cores, plus the habit's own even if it's archived.
  const choosable = cores.data.filter((core) => !core.archivedAt || core.id === habit.data.coreId);
  return (
    <HabitForm
      key={habit.data.id}
      habit={habit.data}
      cores={choosable}
      initial={valuesFromHabit(habit.data)}
    />
  );
}

function HabitForm({
  habit,
  cores,
  initial,
}: {
  /** Editing this habit; creating without it. */
  habit?: HabitDto;
  cores: readonly CoreDto[];
  initial: HabitFormValues;
}) {
  const editing = habit !== undefined;
  const today = useToday();
  const navigate = useNavigate();
  const create = useCreateHabit();
  const update = useUpdateHabit();
  const [formError, setFormError] = useState<string | null>(null);
  const [resolver] = useState(() => habitFormResolver({ today, editing }));
  const form = useForm<HabitFormValues>({ defaultValues: initial, resolver });
  const values = useWatch({ control: form.control }) as HabitFormValues;
  const ids = {
    type: useId(),
    typeHint: useId(),
    schedule: useId(),
    scheduleHint: useId(),
    days: useId(),
    time: useId(),
    levels: useId(),
    step: useId(),
  };

  const patch = (changes: Partial<HabitFormValues>) => {
    for (const [field, value] of Object.entries(changes)) {
      form.setValue(field as HabitFormField, value as never, { shouldDirty: true });
    }
    form.clearErrors();
  };

  const onSubmit = form.handleSubmit(async (submitted) => {
    setFormError(null);
    try {
      if (habit) {
        const changes = changedFields(habit, submitted);
        if (changes && Object.keys(changes).length > 0) {
          await update.mutateAsync({ id: habit.id, input: changes });
          toast.success(`Saved ${submitted.name.trim()}.`);
        }
      } else {
        await create.mutateAsync(createHabitSchema.parse(toHabitInput(submitted)));
        toast.success(`Added ${submitted.name.trim()}.`);
      }
      void navigate('/cores');
    } catch (error) {
      setFormError(
        applyServerError(form, error, { fields: FIELDS, fieldForPath: formFieldForPath }),
      );
    }
  });

  const applicable = adaptiveApplicable(values);
  const frequency = progressingField(values) === 'TIMES_PER_WEEK';
  const preview = previewText(values);
  const boundUnit = frequency
    ? 'times a week'
    : values.type === 'DURATION'
      ? 'minutes'
      : values.unit || 'units';
  const range = startDateRange(today);
  const note = editing ? manualChangeNote(habit, values) : null;

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-8">
      <PageHeader
        title={editing ? 'Edit habit' : 'New habit'}
        description={editing ? habit.name : 'Something small you do regularly, that adds up.'}
      />
      <FormAlert message={formError} />

      <Section title="Basics">
        <TextField
          control={form.control}
          name="name"
          label="Name"
          autoComplete="off"
          autoFocus={!editing}
        />
        <SelectField
          control={form.control}
          name="coreId"
          label="Core"
          options={cores.map((core) => ({ value: core.id, label: core.name }))}
        />
      </Section>

      <Section title="What you track">
        <div className="flex flex-col gap-2">
          <FieldLabel id={ids.type}>Type</FieldLabel>
          <SegmentedControl<HabitType>
            value={values.type}
            onChange={(type) => patch(resetForType(form.getValues(), type))}
            options={TYPES}
            disabled={editing}
            aria-labelledby={ids.type}
            aria-describedby={ids.typeHint}
          />
          <FieldDescription id={ids.typeHint}>
            {editing ? 'To change the type, create a new habit.' : TYPE_HINTS[values.type]}
          </FieldDescription>
        </div>

        {values.type === 'COUNT' && (
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              control={form.control}
              name="target"
              label="Target"
              type="number"
              inputMode="numeric"
              min={1}
              parse={parseNumber}
            />
            <TextField
              control={form.control}
              name="unit"
              label="Unit (optional)"
              placeholder="e.g. pages"
              autoComplete="off"
            />
          </div>
        )}
        {values.type === 'DURATION' && (
          <TextField
            control={form.control}
            name="target"
            label="Target (minutes)"
            type="number"
            inputMode="numeric"
            min={1}
            parse={parseNumber}
            description={minutesHint(values.target)}
          />
        )}
      </Section>

      <Section title="When">
        <div className="flex flex-col gap-2">
          <FieldLabel id={ids.schedule}>Repeat</FieldLabel>
          <SegmentedControl<ScheduleType>
            value={values.scheduleType}
            onChange={(scheduleType) => patch(resetForSchedule(form.getValues(), scheduleType))}
            options={SCHEDULES}
            disabled={editing}
            aria-labelledby={ids.schedule}
            aria-describedby={editing ? ids.scheduleHint : undefined}
          />
          {editing && (
            <FieldDescription id={ids.scheduleHint}>
              To switch between Daily, Weekly and Times a week, create a new habit. You can still
              change {EDITABLE_SCHEDULE[values.scheduleType]}.
            </FieldDescription>
          )}
        </div>

        {values.scheduleType === 'DAILY' && (
          <Controller
            control={form.control}
            name="intervalDays"
            render={({ field, fieldState }) => (
              <div className="flex flex-col gap-2">
                <Stepper
                  value={field.value}
                  onChange={field.onChange}
                  min={1}
                  max={LIMITS.intervalDays}
                  format={intervalText}
                  label="days between"
                />
                <FieldError errors={[fieldState.error]} />
              </div>
            )}
          />
        )}
        {values.scheduleType === 'SPECIFIC_DAYS' && (
          <Controller
            control={form.control}
            name="daysOfWeek"
            render={({ field, fieldState }) => (
              <div className="flex flex-col gap-2">
                <FieldLabel id={ids.days}>Days</FieldLabel>
                <WeekdayPicker
                  value={field.value}
                  onChange={field.onChange}
                  invalid={fieldState.invalid}
                  aria-labelledby={ids.days}
                />
                <FieldError errors={[fieldState.error]} />
              </div>
            )}
          />
        )}
        {values.scheduleType === 'TIMES_PER_WEEK' && (
          <Controller
            control={form.control}
            name="timesPerWeek"
            render={({ field, fieldState }) => (
              <div className="flex flex-col gap-2">
                <Stepper
                  value={field.value}
                  onChange={field.onChange}
                  min={1}
                  max={PROGRESSION_CONFIG.maxTimesPerWeek}
                  format={(n) => `${n}× a week`}
                  label="times a week"
                />
                <FieldError errors={[fieldState.error]} />
              </div>
            )}
          />
        )}

        <div className="flex flex-col gap-2">
          <FieldLabel id={ids.time}>Time of day</FieldLabel>
          <Controller
            control={form.control}
            name="timeOfDay"
            render={({ field }) => (
              <SegmentedControl<TimeOfDay>
                value={field.value}
                onChange={field.onChange}
                options={TIMES_OF_DAY}
                aria-labelledby={ids.time}
                // Four labels don't fit side by side on a phone.
                className="max-sm:grid-flow-row max-sm:grid-cols-2"
              />
            )}
          />
        </div>

        {!editing && (
          <TextField
            control={form.control}
            name="startDate"
            label="Start date"
            type="date"
            min={range.min}
            max={range.max}
            description="Starting in the last few days lets you log them."
          />
        )}
      </Section>

      <Section title="Levels">
        {applicable ? (
          <>
            <div className="flex items-start gap-3">
              <Controller
                control={form.control}
                name="adaptiveEnabled"
                render={({ field }) => (
                  <Switch
                    id={ids.levels}
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    aria-describedby={`${ids.levels}-hint`}
                    className="mt-0.5"
                  />
                )}
              />
              <div className="flex flex-col gap-1">
                <Label htmlFor={ids.levels}>Adjust the target as I go</Label>
                <FieldDescription id={`${ids.levels}-hint`}>
                  Two strong weeks raise it; a rough week eases it. You can undo any change.
                </FieldDescription>
              </div>
            </div>

            {values.adaptiveEnabled && (
              <>
                {frequency ? (
                  <p className="text-sm text-muted-foreground">
                    It moves one time a week at a time.
                  </p>
                ) : (
                  <StepFields form={form} values={values} labelId={ids.step} />
                )}
                <details className="group rounded-2xl bg-muted px-4 py-3">
                  <summary className="cursor-pointer text-sm font-medium">Advanced: limits</summary>
                  <div className="mt-3 grid gap-4 sm:grid-cols-2">
                    <TextField
                      control={form.control}
                      name="minTarget"
                      label={`Lowest (${boundUnit})`}
                      type="number"
                      inputMode="numeric"
                      min={1}
                      parse={parseNumber}
                      description={editing ? undefined : 'Empty: half the starting target.'}
                    />
                    <TextField
                      control={form.control}
                      name="maxTarget"
                      label={`Highest (${boundUnit})`}
                      type="number"
                      inputMode="numeric"
                      min={1}
                      parse={parseNumber}
                      description={frequency ? 'At most 7.' : 'Empty: no limit.'}
                    />
                  </div>
                </details>
                {preview && (
                  <p aria-live="polite" className="rounded-lg bg-muted px-3 py-2 text-sm">
                    {preview}
                  </p>
                )}
              </>
            )}
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Levels work on how often you do a yes/no habit. Switch the schedule to “Times a week” to
            use them.
          </p>
        )}
      </Section>

      {note && (
        <Alert>
          <Info aria-hidden="true" />
          <AlertDescription>{note}</AlertDescription>
        </Alert>
      )}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button asChild variant="surface" size="lg">
          <Link to="/cores">Cancel</Link>
        </Button>
        <Button type="submit" size="lg" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? 'Saving…' : editing ? 'Save changes' : 'Add habit'}
        </Button>
      </div>
    </form>
  );
}

function StepFields({
  form,
  values,
  labelId,
}: {
  form: ReturnType<typeof useForm<HabitFormValues>>;
  values: HabitFormValues;
  labelId: string;
}) {
  const unit = values.type === 'DURATION' ? 'minutes' : values.unit || 'units';
  return (
    <div className="flex flex-col gap-3">
      <FieldLabel id={labelId}>Step</FieldLabel>
      <Controller
        control={form.control}
        name="stepType"
        render={({ field }) => (
          <SegmentedControl<StepType>
            value={field.value}
            onChange={(stepType) => {
              field.onChange(stepType);
              form.setValue(
                'stepValue',
                stepType === 'PERCENT' ? PROGRESSION_CONFIG.defaultStepPercent : null,
              );
              form.clearErrors('stepValue');
            }}
            options={[
              { value: 'PERCENT', label: 'Percent' },
              { value: 'ABSOLUTE', label: 'Fixed amount' },
            ]}
            aria-labelledby={labelId}
            className="sm:max-w-xs"
          />
        )}
      />
      <TextField
        control={form.control}
        name="stepValue"
        label={values.stepType === 'PERCENT' ? 'Step (%)' : `Step (${unit})`}
        type="number"
        inputMode="numeric"
        min={1}
        parse={parseNumber}
        className="sm:max-w-40"
      />
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="flex min-w-0 flex-col">
      <legend className="mb-3 px-1 text-xl font-semibold tracking-tight">{title}</legend>
      <FieldGroup className="gap-5 rounded-3xl bg-card p-5 sm:p-7">{children}</FieldGroup>
    </fieldset>
  );
}

function FormSkeleton({ title }: { title: string }) {
  return (
    <>
      <PageHeader title={title} />
      <div className="flex flex-col gap-4" aria-busy="true" aria-label="Loading">
        <Skeleton className="h-48 w-full rounded-3xl" />
        <Skeleton className="h-40 w-full rounded-3xl" />
      </div>
    </>
  );
}

function LoadError({ onRetry }: { onRetry: () => void }) {
  return (
    <EmptyState
      icon={TriangleAlert}
      title="Couldn't load this form"
      action={
        <Button variant="outline" onClick={onRetry}>
          Try again
        </Button>
      }
    >
      Check your connection and try again.
    </EmptyState>
  );
}
