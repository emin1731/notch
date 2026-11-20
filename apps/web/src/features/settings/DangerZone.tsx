import { deleteAccountSchema } from '@notch/shared';
import { LogOut, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { FormAlert } from '@/components/form/FormAlert';
import { PasswordField } from '@/components/form/PasswordField';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FieldGroup } from '@/components/ui/field';
import { useDeleteAccount, useLogoutAll } from '@/features/auth/hooks';
import { isApiError } from '@/lib/api-client';
import { applyServerError, useZodForm } from '@/lib/forms';
import { SETTINGS_COPY } from './copy';
import { SettingsSection } from './SettingsSection';

/** Log out everywhere, and delete the account (plan 7.5). */
export function DangerZone() {
  const logoutAll = useLogoutAll();
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [deleting, setDeleting] = useState(false);

  return (
    <SettingsSection title="Danger zone">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm">
          <div className="text-[0.9375rem] font-medium">Log out everywhere</div>
          <div className="text-muted-foreground">Every device, this one too.</div>
        </div>
        <Button variant="secondary" onClick={() => setConfirmLogout(true)}>
          <LogOut />
          Log out everywhere
        </Button>
      </div>
      <div className="flex flex-col gap-4 border-t pt-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="text-sm">
          <div className="text-[0.9375rem] font-medium">Delete account</div>
          <div className="text-muted-foreground">
            Your cores, goals, habits and logs, gone for good.
          </div>
        </div>
        <Button variant="destructive" onClick={() => setDeleting(true)}>
          <Trash2 />
          Delete account
        </Button>
      </div>

      <ConfirmDialog
        open={confirmLogout}
        onOpenChange={setConfirmLogout}
        title="Log out everywhere?"
        description="You'll be logged out on every device, this one too. You can log back in any time."
        confirmLabel="Log out everywhere"
        onConfirm={async () => {
          await logoutAll.mutateAsync();
          toast(SETTINGS_COPY.loggedOutEverywhere);
        }}
      />
      <Dialog open={deleting} onOpenChange={setDeleting}>
        <DialogContent className="sm:max-w-md">
          {deleting && <DeleteAccountForm onCancel={() => setDeleting(false)} />}
        </DialogContent>
      </Dialog>
    </SettingsSection>
  );
}

function DeleteAccountForm({ onCancel }: { onCancel: () => void }) {
  const remove = useDeleteAccount();
  const form = useZodForm(deleteAccountSchema, { defaultValues: { password: '' } });
  const [formError, setFormError] = useState<string | null>(null);

  const submit = form.handleSubmit(async (values) => {
    setFormError(null);
    try {
      await remove.mutateAsync(values);
      toast(SETTINGS_COPY.accountDeleted);
    } catch (error) {
      if (isApiError(error, 'INVALID_CREDENTIALS')) {
        form.setError(
          'password',
          { type: 'server', message: SETTINGS_COPY.wrongPassword },
          { shouldFocus: true },
        );
        return;
      }
      setFormError(applyServerError(form, error, { fields: ['password'] }));
    }
  });

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-4">
      <DialogHeader>
        <DialogTitle>Delete your account?</DialogTitle>
        <DialogDescription>
          This deletes your cores, goals, habits, logs and reviews, and can&apos;t be undone. Enter
          your password to confirm.
        </DialogDescription>
      </DialogHeader>
      <FieldGroup>
        <FormAlert message={formError} />
        <PasswordField
          control={form.control}
          name="password"
          label="Password"
          autoComplete="current-password"
          autoFocus
        />
      </FieldGroup>
      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" variant="destructive" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? 'Deleting…' : 'Delete account'}
        </Button>
      </DialogFooter>
    </form>
  );
}
