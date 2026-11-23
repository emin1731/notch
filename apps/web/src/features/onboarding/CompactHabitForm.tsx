import {
  type HabitTemplate,
  type HabitType,
  PROGRESSION_CONFIG,
  type ScheduleType,
} from '@notch/shared';
import { useId } from 'react';
import { Controller, type Resolver, useForm, useWatch } from 'react-hook-form';
import { SelectField } from '@/components/form/SelectField';
import { TextField } from '@/components/form/TextField';
import { SegmentedControl } from '@/components/SegmentedControl';
import { Stepper } from '@/components/Stepper';
import { Button } from '@/components/ui/button';
import { FieldDescription, FieldError, FieldGroup, FieldLabel } from '@/components/ui/field';
import { WeekdayPicker } from '@/components/WeekdayPicker';
import {
  defaultValues,
  type HabitFormValues,
  habitFormResolver,
  minutesHint,
  resetForSchedule,
  resetForType,
  toHabitInput,
} from '@/features/habits/habit-form';
import { parseNumber, SCHEDULES, TYPE_HINTS, TYPES } from '@/features/habits/habit-options';
import { useToday } from '@/lib/use-today';
import type { DraftCore } from './onboarding-model';

/** Stands in for the core while validating: the real one doesn't exist until submission. */
const DRAFT_CORE_ID = '00000000-0000-4000-8000-000000000000';

/**
 * The habit form's essentials (name, core, type, target, schedule) for onboarding. Validation is
 * the full form's, so what it adds the API accepts; levels keep their defaults.
 */
export function CompactHabitForm({
  cores,
  defaultCoreKey,
  onAdd,
}: {
  cores: readonly DraftCore[];
  defaultCoreKey: string;
  onAdd: (habit: { coreKey: string; input: HabitTemplate }) => void;
}) {
  const today = useToday();
  const base = habitFormResolver({ today, editing: false });
  // The `coreId` field holds the draft core's key; the shared rules see a placeholder id.
  const resolver: Resolver<HabitFormValues> = async (values, context, options) => {
    const result = await base({ ...values, coreId: DRAFT_CORE_ID }, context, options);
    return Object.keys(result.errors).length > 0 ? result : { values, errors: {} };
  };
  const form = useForm<HabitFormValues>({
    resolver,
    defaultValues: defaultValues({ coreId: defaultCoreKey, today }),
  });
  const values = useWatch({ control: form.control }) as HabitFormValues;
  const ids = { type: useId(), typeHint: useId(), schedule: useId(), days: useId() };

  const patch = (changes: Partial<HabitFormValues>) => {
    for (const [field, value] of Object.entries(changes)) {
      form.setValue(field as keyof HabitFormValues, value as never, { shouldValidate: false });
    }
  };

  const submit = form.handleSubmit((values) => {
    const { coreId: _core, ...input } = toHabitInput({ ...values, coreId: DRAFT_CORE_ID });
    onAdd({ coreKey: values.coreId, input });
  });

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <FieldGroup>
        <TextField
          control={form.control}
          name="name"
          label="Name"
          placeholder="e.g. Stretch"
          autoComplete="off"
          autoFocus
        />
        <SelectField
          control={form.control}
          name="coreId"
          label="Core"
          options={cores.map((core) => ({ value: core.key, label: core.name }))}
        />
        <div className="flex flex-col gap-2">
          <FieldLabel id={ids.type}>Type</FieldLabel>
          <SegmentedControl<HabitType>
            value={values.type}
            onChange={(type) => patch(resetForType(form.getValues(), type))}
            options={TYPES}
            aria-labelledby={ids.type}
            aria-describedby={ids.typeHint}
          />
          <FieldDescription id={ids.typeHint}>{TYPE_HINTS[values.type]}</FieldDescription>
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
        <div className="flex flex-col gap-2">
          <FieldLabel id={ids.schedule}>Schedule</FieldLabel>
          <SegmentedControl<ScheduleType>
            value={values.scheduleType}
            onChange={(scheduleType) => patch(resetForSchedule(form.getValues(), scheduleType))}
            options={SCHEDULES}
            aria-labelledby={ids.schedule}
          />
        </div>
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
      </FieldGroup>
      <div className="flex justify-end">
        <Button type="submit">Add habit</Button>
      </div>
    </form>
  );
}
