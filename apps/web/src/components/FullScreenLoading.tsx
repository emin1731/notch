import { LoaderCircle } from 'lucide-react';
import { useEffect, useState } from 'react';

/**
 * While the session is checked on load. Shows nothing for the first moment, so a quick answer
 * doesn't flash a spinner.
 */
export function FullScreenLoading({ delayMs = 400 }: { delayMs?: number }) {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setShown(true), delayMs);
    return () => clearTimeout(timer);
  }, [delayMs]);
  return (
    <div
      className="flex min-h-dvh items-center justify-center bg-background"
      aria-busy="true"
      aria-label="Loading"
    >
      {shown && (
        <LoaderCircle className="size-6 animate-spin text-muted-foreground" aria-hidden="true" />
      )}
    </div>
  );
}
