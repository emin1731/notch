import { changePasswordSchema, nameSchema } from '@notch/shared';
import { Globe } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { FormAlert } from '@/components/form/FormAlert';
import { PasswordField } from '@/components/form/PasswordField';
import { SelectField } from '@/components/form/SelectField';
import { TextField } from '@/components/form/TextField';
import { SegmentedControl } from '@/components/SegmentedControl';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { FieldGroup } from '@/components/ui/field';
import { type Theme, useTheme } from '@/app/theme-context';
import { useAuth } from '@/features/auth/auth-context';
import { useChangePassword, useUpdateProfile } from '@/features/auth/hooks';
import { isApiError } from '@/lib/api-client';
import { applyServerError, useZodForm } from '@/lib/forms';
import { mismatchText, timezoneOptions, useTimezoneMismatch } from '@/lib/timezone';
import { SETTINGS_COPY } from './copy';
import { SettingsSection } from './SettingsSection';

const profileSchema = z.object({ name: z.union([z.literal(''), nameSchema]) });

export function ProfileSection() {
  const { user } = useAuth();
  const update = useUpdateProfile();
  const form = useZodForm(profileSchema, { defaultValues: { name: user?.name ?? '' } });
  const [formError, setFormError] = useState<string | null>(null);

  const submit = form.handleSubmit(async ({ name }) => {
    setFormError(null);
    try {
      const saved = await update.mutateAsync({ name: name === '' ? null : name });
      form.reset({ name: saved.name ?? '' });
      toast.success(SETTINGS_COPY.profileSaved);
    } catch (error) {
      setFormError(applyServerError(form, error, { fields: ['name'] }));
    }
  });

  return (
    <SettingsSection title="Profile">
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <FieldGroup>
          <FormAlert message={formError} />
          <TextField
            control={form.control}
            name="name"
            label="Name"
            description="Shown in the app. Leave it empty to use your username."
            autoComplete="name"
          />
          <div className="flex flex-col gap-1 text-sm">
            <span className="font-medium">Username</span>
            <span className="text-muted-foreground">@{user?.username}</span>
          </div>
        </FieldGroup>
        <Button type="submit" className="self-start" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? 'Saving…' : 'Save'}
        </Button>
      </form>
    </SettingsSection>
  );
}

const timezoneFormSchema = z.object({ timezone: z.string().min(1) });

export function TimezoneSection() {
  const { device, account, mismatch } = useTimezoneMismatch();
  const update = useUpdateProfile();
  const options = useMemo(() => timezoneOptions(account), [account]);
  const form = useZodForm(timezoneFormSchema, { defaultValues: { timezone: account } });
  const [formError, setFormError] = useState<string | null>(null);

  const save = async (timezone: string) => {
    setFormError(null);
    try {
      const saved = await update.mutateAsync({ timezone });
      form.reset({ timezone: saved.timezone });
      toast.success(SETTINGS_COPY.timezoneSaved(saved.timezone));
    } catch (error) {
      setFormError(applyServerError(form, error, { fields: ['timezone'] }));
    }
  };

  return (
    <SettingsSection title="Timezone" description={SETTINGS_COPY.timezoneHint}>
      {mismatch && (
        <Alert>
          <Globe aria-hidden="true" />
          <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>{mismatchText(device, account)} Update?</span>
            <Button
              variant="outline"
              size="sm"
              disabled={update.isPending}
              onClick={() => void save(device)}
            >
              Use {device}
            </Button>
          </AlertDescription>
        </Alert>
      )}
      <form
        onSubmit={form.handleSubmit(({ timezone }) => save(timezone))}
        noValidate
        className="flex flex-col gap-4"
      >
        <FieldGroup>
          <FormAlert message={formError} />
          <SelectField control={form.control} name="timezone" label="Timezone" options={options} />
        </FieldGroup>
        <Button
          type="submit"
          className="self-start"
          disabled={form.formState.isSubmitting || !form.formState.isDirty}
        >
          {form.formState.isSubmitting ? 'Saving…' : 'Save timezone'}
        </Button>
      </form>
    </SettingsSection>
  );
}

export function PasswordSection() {
  const change = useChangePassword();
  const form = useZodForm(changePasswordSchema, {
    defaultValues: { currentPassword: '', newPassword: '' },
  });
  const [formError, setFormError] = useState<string | null>(null);

  const submit = form.handleSubmit(async (values) => {
    setFormError(null);
    try {
      await change.mutateAsync(values);
      form.reset();
      toast.success(SETTINGS_COPY.passwordChanged);
    } catch (error) {
      if (isApiError(error, 'INVALID_CREDENTIALS')) {
        form.setError(
          'currentPassword',
          { type: 'server', message: SETTINGS_COPY.wrongPassword },
          { shouldFocus: true },
        );
        return;
      }
      setFormError(applyServerError(form, error, { fields: ['currentPassword', 'newPassword'] }));
    }
  });

  return (
    <SettingsSection title="Password" description="Changing it logs out your other devices.">
      <form onSubmit={submit} noValidate className="flex flex-col gap-4">
        <FieldGroup>
          <FormAlert message={formError} />
          <PasswordField
            control={form.control}
            name="currentPassword"
            label="Current password"
            autoComplete="current-password"
          />
          <PasswordField
            control={form.control}
            name="newPassword"
            label="New password"
            description="At least 8 characters."
            autoComplete="new-password"
          />
        </FieldGroup>
        <Button type="submit" className="self-start" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? 'Saving…' : 'Change password'}
        </Button>
      </form>
    </SettingsSection>
  );
}

const THEME_OPTIONS = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
] as const satisfies readonly { value: Theme; label: string }[];

export function ThemeSection() {
  const { theme, setTheme } = useTheme();
  return (
    <SettingsSection title="Theme" description="System follows your device's setting.">
      <span id="theme-label" className="sr-only">
        Theme
      </span>
      <SegmentedControl
        value={theme}
        onChange={setTheme}
        options={THEME_OPTIONS}
        aria-labelledby="theme-label"
        className="max-w-sm"
      />
    </SettingsSection>
  );
}
