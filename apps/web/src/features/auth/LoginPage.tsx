import { loginSchema } from '@notch/shared';
import { useState } from 'react';
import { Link, useLocation } from 'react-router';
import { FormAlert } from '@/components/form/FormAlert';
import { PasswordField } from '@/components/form/PasswordField';
import { TextField } from '@/components/form/TextField';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader } from '@/components/ui/card';
import { FieldGroup } from '@/components/ui/field';
import { applyServerError, useZodForm } from '@/lib/forms';
import { useLogin } from './hooks';

export default function LoginPage() {
  const location = useLocation();
  const login = useLogin();
  const form = useZodForm(loginSchema, { defaultValues: { username: '', password: '' } });
  const [formError, setFormError] = useState<string | null>(null);

  // On success `['me']` is set and GuestOnly takes you back to the page you asked for.
  const onSubmit = form.handleSubmit(async (values) => {
    setFormError(null);
    try {
      await login.mutateAsync(values);
    } catch (error) {
      setFormError(applyServerError(form, error, { fields: ['username', 'password'] }));
    }
  });

  return (
    <Card>
      <CardHeader>
        <h1 className="text-2xl font-bold tracking-tight">Log in</h1>
        <CardDescription>Welcome back. Pick up where you left off.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} noValidate>
          <FieldGroup>
            <FormAlert message={formError} />
            <TextField
              control={form.control}
              name="username"
              label="Username"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              autoFocus
            />
            <PasswordField
              control={form.control}
              name="password"
              label="Password"
              autoComplete="current-password"
            />
            <Button type="submit" size="lg" disabled={form.formState.isSubmitting}>
              {form.formState.isSubmitting ? 'Logging in…' : 'Log in'}
            </Button>
          </FieldGroup>
        </form>
      </CardContent>
      <CardFooter className="justify-center text-muted-foreground">
        <p>
          New here?{' '}
          <Link
            to="/register"
            state={location.state}
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Register with an invite code
          </Link>
        </p>
      </CardFooter>
    </Card>
  );
}
