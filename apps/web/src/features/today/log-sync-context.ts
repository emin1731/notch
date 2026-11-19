import { createContext, useContext } from 'react';
import type { LogSync } from './log-sync';

export const LogSyncContext = createContext<LogSync | null>(null);

export function useLogSync(): LogSync {
  const sync = useContext(LogSyncContext);
  if (!sync) {
    throw new Error('useLogSync must be used inside <LogSyncProvider>');
  }
  return sync;
}
