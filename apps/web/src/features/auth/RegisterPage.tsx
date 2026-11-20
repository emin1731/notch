import { registerSchema } from '@notch/shared';
import { useState } from 'react';
import { Link, useLocation } from 'react-router';
import { FormAlert } from '@/components/form/FormAlert';
import { PasswordField } from '@/components/form/PasswordField';
import { TextField } from '@/components/form/TextField';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader } from '@/components/ui/card';
import { FieldDescription, FieldGroup } from '@/components/ui/field';
import { applyServerError, useZodForm } from '@/lib/forms';
import { useRegister } from './hooks';
import { deviceTimezone } from '@/lib/timezone';

const FIELDS = ['username', 'password', 'name', 'inviteCode'] as const;

export default function RegisterPage() {
  const location = useLocation();
  const register = useRegister();
  const [timezone] = useState(deviceTimezone);
  const form = useZodForm(registerSchema, {
    // The timezone has no input: it's this device's, and can be changed later in Settings.
    defaultValues: { username: '', password: '', name: undefined, inviteCode: '', timezone },
  });
  const [formError, setFormError] = useState<string | null>(null);

  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);
    try {
      await register.mutateAsync(values);
    } catch (error) {
      setFormError(
        applyServerError(form, error, {
          fields: FIELDS,
          codes: { USERNAME_TAKEN: 'username', INVALID_INVITE_CODE: 'inviteCode' },
        }),
      );
    }
  });

  return (
    <Card>
      <CardHeader>
        <h1 className="text-2xl font-bold tracking-tight">Create your account</h1>
        <CardDescription>
          notch is invite-only. You'll need the code you were given.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} noValidate>
          <FieldGroup>
            <FormAlert message={formError} />
            <TextField
              control={form.control}
              name="username"
              label="Username"
              description="Letters, digits, dot, dash or underscore. You'll log in with it."
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              autoFocus
            />
            <PasswordField
              control={form.control}
              name="password"
              label="Password"
              description="At least 8 characters."
              autoComplete="new-password"
            />
            <TextField
              control={form.control}
              name="name"
              label="Name (optional)"
              description="What notch calls you."
              autoComplete="given-name"
              parse={(text) => (text === '' ? undefined : text)}
            />
            <TextField
              control={form.control}
              name="inviteCode"
              label="Invite code"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
            />
            <FieldDescription>
              Timezone: {timezone}, from this device. You can change it in Settings.
            </FieldDescription>
            <Button type="submit" size="lg" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? 'Creating account…' : 'Create account'}
            </Button>
          </FieldGroup>
        </form>
      </CardContent>
      <CardFooter className="justify-center text-muted-foreground">
        <p>
          Already have an account?{' '}
          <Link
            to="/login"
            state={location.state}
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Log in
          </Link>
        </p>
      </CardFooter>
    </Card>
  );
}
