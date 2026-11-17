import type { Request } from 'express';

/** What `@CurrentUser()` returns. Loaded with the session on every request, so it's always current. */
export interface AuthUser {
  id: string;
  username: string;
  timezone: string;
}

export interface RequestAuth {
  user: AuthUser;
  sessionId: string;
}

/** An Express request after SessionGuard: `auth` is set on every non-public route. */
export type AuthedRequest = Request & { auth?: RequestAuth };

/** The raw cookie value, if the browser sent one. */
export function readCookie(req: Request, name: string): string | undefined {
  const value: unknown = req.cookies?.[name];
  return typeof value === 'string' && value !== '' ? value : undefined;
}
