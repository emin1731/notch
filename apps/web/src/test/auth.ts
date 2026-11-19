import { type ErrorCode, todayIn, type UserDto } from '@notch/shared';
import { http, HttpResponse } from 'msw';
import { server } from './server';

export const API = '/api/v1';

export const testUser: UserDto = {
  id: '00000000-0000-4000-8000-000000000001',
  username: 'emin',
  name: 'Emin',
  timezone: 'Asia/Baku',
  onboardedAt: '2026-11-01T08:00:00.000Z',
};

export function setCsrfCookie(value = 'csrf-token'): void {
  document.cookie = `XSRF-TOKEN=${value}; path=/`;
}

export function clearCookies(): void {
  for (const part of document.cookie.split(';')) {
    const name = part.split('=')[0]?.trim();
    if (name) {
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
    }
  }
}

/** An API error response, shaped like the API's exception filter. */
export function apiError(
  status: number,
  code: ErrorCode,
  message: string = code,
  details?: Record<string, unknown>,
) {
  return HttpResponse.json({ statusCode: status, code, message, details }, { status });
}

/**
 * `/auth/me` answers with this user. Today answers with an empty day, since every login lands
 * there; tests about Today register their own.
 */
export function signedIn(user: UserDto = testUser): void {
  setCsrfCookie();
  server.use(
    http.get(`${API}/auth/me`, () => HttpResponse.json(user)),
    http.get(`${API}/today`, ({ request }) =>
      HttpResponse.json({
        date: new URL(request.url).searchParams.get('date') ?? todayIn(user.timezone, new Date()),
        dayProgress: null,
        pendingReview: null,
        welcomeBack: false,
        groups: [],
        weeklyQuota: [],
      }),
    ),
  );
}

/** `/auth/me` answers 401. */
export function signedOut(): void {
  setCsrfCookie();
  server.use(http.get(`${API}/auth/me`, () => apiError(401, 'UNAUTHENTICATED', 'Not logged in')));
}
