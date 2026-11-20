import { RefreshCw, TriangleAlert } from 'lucide-react';
import { isRouteErrorResponse, Link, useRouteError } from 'react-router';
import { Button } from '@/components/ui/button';
import { isChunkLoadError } from '@/lib/chunk-error';

/** What any route shows instead of crashing: a reload for a stale tab, else a way back. */
export function RouteError() {
  const error = useRouteError();
  const stale = isChunkLoadError(error);
  const missing = isRouteErrorResponse(error) && error.status === 404;
  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-4 text-foreground">
      <div className="flex max-w-sm flex-col items-center text-center">
        <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-muted">
          {stale ? (
            <RefreshCw className="size-6 text-muted-foreground" aria-hidden="true" />
          ) : (
            <TriangleAlert className="size-6 text-muted-foreground" aria-hidden="true" />
          )}
        </div>
        <h1 className="text-xl font-semibold tracking-tight">
          {stale ? 'notch was updated' : missing ? 'Nothing here' : 'Something went wrong'}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {stale
            ? 'Reload to get the new version. Your data is safe.'
            : 'This screen hit a problem. Your data is safe.'}
        </p>
        {stale ? (
          <Button className="mt-6" onClick={() => window.location.reload()}>
            Reload
          </Button>
        ) : (
          <Button asChild className="mt-6">
            <Link to="/today" reloadDocument>
              Go to Today
            </Link>
          </Button>
        )}
      </div>
    </main>
  );
}
