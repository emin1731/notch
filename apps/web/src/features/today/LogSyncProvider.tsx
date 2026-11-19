import { useQueryClient } from '@tanstack/react-query';
import { type ReactNode, useEffect, useState } from 'react';
import { createLogSync } from './log-sync';
import { LogSyncContext } from './log-sync-context';

/** One LogSync for the app, so writes keep going (in order) when the page changes. */
export function LogSyncProvider({ children }: { children: ReactNode }) {
  const client = useQueryClient();
  const [sync] = useState(() => createLogSync(client));

  useEffect(() => {
    // Unsent counter taps still reach the server when the tab is closed or reloaded.
    const onPageHide = () => sync.flush({ keepalive: true });
    window.addEventListener('pagehide', onPageHide);
    return () => window.removeEventListener('pagehide', onPageHide);
  }, [sync]);

  return <LogSyncContext value={sync}>{children}</LogSyncContext>;
}
