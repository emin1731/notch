import { type ErrorCode, isErrorCode } from '@notch/shared';

/** Plan 7.2. Same origin as the app (the Vite proxy in development), so cookies just work. */
export const API_BASE = '/api/v1';

const CSRF_COOKIE = 'XSRF-TOKEN';
const CSRF_HEADER = 'X-XSRF-TOKEN';

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
const UNSAFE_METHODS: ReadonlySet<Method> = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

/** The API's error codes, plus one for a request that never got a response. */
export type ApiErrorCode = ErrorCode | 'NETWORK_ERROR';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: ApiErrorCode,
    message: string,
    readonly details?: Record<string, unknown>,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = 'ApiError';
  }
}

export function isApiError(error: unknown, code?: ApiErrorCode): error is ApiError {
  return error instanceof ApiError && (code === undefined || error.code === code);
}

export type QueryParams = Record<string, string | number | boolean | null | undefined>;

export interface RequestOptions {
  query?: QueryParams;
  signal?: AbortSignal;
  /** `false` keeps a 401 from counting as an ended session (`/auth/me` asks exactly that). */
  authHandler?: boolean;
}

let onUnauthenticated: (() => void) | null = null;

/** Called on any `401 UNAUTHENTICATED`; the auth provider registers it. */
export function setUnauthenticatedHandler(handler: (() => void) | null): void {
  onUnauthenticated = handler;
}

export function readCookie(name: string): string | undefined {
  for (const part of document.cookie.split(';')) {
    const [key, ...value] = part.trim().split('=');
    if (key === name) {
      return decodeURIComponent(value.join('='));
    }
  }
  return undefined;
}

let csrfRequest: Promise<void> | null = null;

/**
 * Makes sure the `XSRF-TOKEN` cookie exists, fetching it once if not (or always, with `refresh`).
 * Concurrent callers share one request.
 */
export function ensureCsrf(refresh = false): Promise<void> {
  if (!refresh && readCookie(CSRF_COOKIE)) {
    return Promise.resolve();
  }
  csrfRequest ??= request<void>('GET', '/auth/csrf', undefined, { authHandler: false }).finally(
    () => {
      csrfRequest = null;
    },
  );
  return csrfRequest;
}

function toUrl(path: string, query?: QueryParams): URL {
  const url = new URL(API_BASE + path, window.location.origin);
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null) {
      url.searchParams.set(key, String(value));
    }
  }
  return url;
}

async function toApiError(response: Response): Promise<ApiError> {
  const body: unknown = await response.json().catch(() => null);
  if (body && typeof body === 'object' && 'code' in body && isErrorCode(body.code)) {
    const { message, details } = body as { message?: unknown; details?: unknown };
    return new ApiError(
      response.status,
      body.code,
      typeof message === 'string' ? message : response.statusText,
      details && typeof details === 'object' ? (details as Record<string, unknown>) : undefined,
    );
  }
  // Not the API talking: a proxy's error page, say.
  return new ApiError(
    response.status,
    response.status >= 500 ? 'INTERNAL' : 'BAD_REQUEST',
    response.statusText || 'Request failed',
  );
}

async function request<T>(
  method: Method,
  path: string,
  body: unknown,
  options: RequestOptions = {},
  isRetry = false,
): Promise<T> {
  const unsafe = UNSAFE_METHODS.has(method);
  if (unsafe) {
    await ensureCsrf();
  }

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  // Read on every request: login, logout and register each issue a new token.
  const token = unsafe ? readCookie(CSRF_COOKIE) : undefined;
  if (token) {
    headers[CSRF_HEADER] = token;
  }

  let response: Response;
  try {
    response = await fetch(toUrl(path, options.query), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'same-origin',
      signal: options.signal,
    });
  } catch (cause) {
    if (options.signal?.aborted) {
      throw cause;
    }
    throw new ApiError(0, 'NETWORK_ERROR', 'Network request failed', undefined, { cause });
  }

  if (response.ok) {
    return (response.status === 204 ? undefined : await response.json()) as T;
  }

  const error = await toApiError(response);
  if (unsafe && !isRetry && error.code === 'CSRF_INVALID') {
    // A stale token, e.g. after logging in from another tab: fetch a fresh one and try once more.
    await ensureCsrf(true);
    return request<T>(method, path, body, options, true);
  }
  if (error.code === 'UNAUTHENTICATED' && options.authHandler !== false) {
    onUnauthenticated?.();
  }
  throw error;
}

export const api = {
  get: <T>(path: string, options?: RequestOptions) => request<T>('GET', path, undefined, options),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>('POST', path, body, options),
  put: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>('PUT', path, body, options),
  patch: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>('PATCH', path, body, options),
  delete: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    request<T>('DELETE', path, body, options),
};
