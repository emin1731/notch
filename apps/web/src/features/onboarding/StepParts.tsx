import { RotateCcw } from 'lucide-react';
import type { ReactNode } from 'react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ONBOARDING_COPY } from './copy';
import type { SubmitFailure } from './onboarding-model';

/** What every step gets: the failure that belongs to it, if any, and a retry. */
export interface StepProps {
  failure: SubmitFailure | null;
  retrying: boolean;
  onRetry: () => void;
}

export function StepHeader({ title, children }: { title: string; children: ReactNode }) {
  return (
    <header className="flex flex-col gap-2">
      <h1 id="step-title" className="text-2xl font-semibold tracking-tight">
        {title}
      </h1>
      <p className="text-muted-foreground">{children}</p>
    </header>
  );
}

/** A failed submission, on the step it belongs to: what went wrong, and a retry. */
export function FailureAlert({ failure, retrying, onRetry }: StepProps) {
  if (!failure) {
    return null;
  }
  return (
    <Alert variant="destructive">
      <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <span>
          {ONBOARDING_COPY.failed[failure.phase]} {failure.message}
        </span>
        <Button variant="outline" size="sm" disabled={retrying} onClick={onRetry}>
          <RotateCcw />
          {retrying ? 'Trying…' : 'Try again'}
        </Button>
      </AlertDescription>
    </Alert>
  );
}

/** Back on the left; the step's actions on the right. */
export function StepFooter({ onBack, children }: { onBack?: () => void; children: ReactNode }) {
  return (
    <footer className="flex items-center justify-between gap-3 border-t pt-6">
      {onBack ? (
        <Button variant="ghost" onClick={onBack}>
          Back
        </Button>
      ) : (
        <span />
      )}
      <div className="flex items-center gap-2">{children}</div>
    </footer>
  );
}
