import { createHash, randomBytes } from 'node:crypto';

export const SESSION_COOKIE = 'SESSION';
export const CSRF_COOKIE = 'XSRF-TOKEN';
export const CSRF_HEADER = 'x-xsrf-token';

/** 256 random bits, URL-safe. */
export function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** What a CSRF token is bound to: the hash of the session cookie, or "anon" without one. */
export function csrfBinding(sessionToken: string | undefined): string {
  return sessionToken ? sha256(sessionToken) : 'anon';
}
