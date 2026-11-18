import { CloudOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/features/auth/auth-context';

/** The whole page when the API can't be reached on load. Not the same as being logged out. */
export function ServerErrorScreen() {
  const { retry, retrying } = useAuth();
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 text-foreground">
      <div className="flex max-w-sm flex-col items-center text-center">
        <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-muted">
          <CloudOff className="size-6 text-muted-foreground" aria-hidden="true" />
        </div>
        <h1 className="text-xl font-semibold tracking-tight">Can't reach notch</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Check your connection and try again. Your data is safe.
        </p>
        <Button className="mt-6" onClick={retry} disabled={retrying}>
          {retrying ? 'Trying…' : 'Try again'}
        </Button>
      </div>
    </main>
  );
}
