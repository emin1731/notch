import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { API, apiError, setCsrfCookie } from '@/test/auth';
import { server } from '@/test/server';
import { api, ApiError, setUnauthenticatedHandler } from './api-client';

const csrfHeader = (request: Request) => request.headers.get('x-xsrf-token');

/** `/auth/csrf` sets the cookie the way the API does, and counts its calls. */
function mockCsrfEndpoint(token: string) {
  const calls = { count: 0 };
  server.use(
    http.get(`${API}/auth/csrf`, () => {
      calls.count += 1;
      setCsrfCookie(token);
      return new HttpResponse(null, { status: 204 });
    }),
  );
  return calls;
}

afterEach(() => setUnauthenticatedHandler(null));

describe('api client', () => {
  it('sends no CSRF header on GET', async () => {
    setCsrfCookie('token');
    let header: string | null = 'not called';
    server.use(
      http.get(`${API}/things`, ({ request }) => {
        header = csrfHeader(request);
        return HttpResponse.json({ ok: true });
      }),
    );

    await expect(api.get('/things')).resolves.toEqual({ ok: true });
    expect(header).toBeNull();
  });

  it.each(['post', 'put', 'patch', 'delete'] as const)(
    'sends the cookie as X-XSRF-TOKEN on %s, read again for every request',
    async (method) => {
      const seen: (string | null)[] = [];
      server.use(
        http[method](`${API}/things`, ({ request }) => {
          seen.push(csrfHeader(request));
          return new HttpResponse(null, { status: 204 });
        }),
      );

      setCsrfCookie('before-login');
      await api[method]('/things', { a: 1 });
      // Login, logout and register each issue a new token.
      setCsrfCookie('after-login');
      await api[method]('/things');

      expect(seen).toEqual(['before-login', 'after-login']);
    },
  );

  it('sends the body as JSON', async () => {
    setCsrfCookie();
    let body: unknown;
    let contentType: string | null = null;
    server.use(
      http.post(`${API}/things`, async ({ request }) => {
        body = await request.json();
        contentType = request.headers.get('content-type');
        return HttpResponse.json({ id: 1 }, { status: 201 });
      }),
    );

    await expect(api.post('/things', { name: 'Run' })).resolves.toEqual({ id: 1 });
    expect(body).toEqual({ name: 'Run' });
    expect(contentType).toBe('application/json');
  });

  it('fetches a token first when the cookie is missing, once for concurrent requests', async () => {
    const csrf = mockCsrfEndpoint('fresh');
    const seen: (string | null)[] = [];
    server.use(
      http.post(`${API}/things`, ({ request }) => {
        seen.push(csrfHeader(request));
        return new HttpResponse(null, { status: 204 });
      }),
    );

    await Promise.all([api.post('/things'), api.post('/things')]);

    expect(csrf.count).toBe(1);
    expect(seen).toEqual(['fresh', 'fresh']);
  });

  it('fetches a fresh token and retries once on CSRF_INVALID', async () => {
    setCsrfCookie('stale');
    const csrf = mockCsrfEndpoint('fresh');
    const seen: (string | null)[] = [];
    server.use(
      http.post(`${API}/things`, ({ request }) => {
        seen.push(csrfHeader(request));
        return seen.length === 1 ? apiError(403, 'CSRF_INVALID') : HttpResponse.json({ ok: true });
      }),
    );

    await expect(api.post('/things')).resolves.toEqual({ ok: true });
    expect(csrf.count).toBe(1);
    expect(seen).toEqual(['stale', 'fresh']);
  });

  it('gives up after that one retry', async () => {
    setCsrfCookie('stale');
    mockCsrfEndpoint('still-wrong');
    let attempts = 0;
    server.use(
      http.post(`${API}/things`, () => {
        attempts += 1;
        return apiError(403, 'CSRF_INVALID');
      }),
    );

    await expect(api.post('/things')).rejects.toMatchObject({ code: 'CSRF_INVALID' });
    expect(attempts).toBe(2);
  });

  it('parses an API error body into an ApiError', async () => {
    setCsrfCookie();
    server.use(
      http.post(`${API}/auth/register`, () =>
        apiError(409, 'USERNAME_TAKEN', 'That username is taken', { field: 'username' }),
      ),
    );

    const error = await api.post('/auth/register', {}).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({
      status: 409,
      code: 'USERNAME_TAKEN',
      message: 'That username is taken',
      details: { field: 'username' },
    });
  });

  it('treats an error page that is not from the API as INTERNAL', async () => {
    server.use(
      http.get(`${API}/things`, () => new HttpResponse('<h1>Bad gateway</h1>', { status: 502 })),
    );

    await expect(api.get('/things')).rejects.toMatchObject({ status: 502, code: 'INTERNAL' });
  });

  it('reports a request that got no response as NETWORK_ERROR', async () => {
    server.use(http.get(`${API}/things`, () => HttpResponse.error()));

    await expect(api.get('/things')).rejects.toMatchObject({ status: 0, code: 'NETWORK_ERROR' });
  });

  it('returns undefined for 204 No Content', async () => {
    setCsrfCookie();
    server.use(http.delete(`${API}/things/1`, () => new HttpResponse(null, { status: 204 })));

    await expect(api.delete('/things/1')).resolves.toBeUndefined();
  });

  it('adds query parameters, skipping empty ones', async () => {
    let search = '';
    server.use(
      http.get(`${API}/things`, ({ request }) => {
        search = new URL(request.url).search;
        return HttpResponse.json([]);
      }),
    );

    await api.get('/things', { query: { from: '2026-11-01', archived: false, coreId: undefined } });

    expect(search).toBe('?from=2026-11-01&archived=false');
  });

  it('calls the unauthenticated handler on 401, unless the request opts out', async () => {
    const handler = vi.fn();
    setUnauthenticatedHandler(handler);
    server.use(http.get(`${API}/things`, () => apiError(401, 'UNAUTHENTICATED')));

    await expect(api.get('/things')).rejects.toMatchObject({ code: 'UNAUTHENTICATED' });
    expect(handler).toHaveBeenCalledTimes(1);

    await expect(api.get('/things', { authHandler: false })).rejects.toBeInstanceOf(ApiError);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('does not treat wrong login details as an ended session', async () => {
    const handler = vi.fn();
    setUnauthenticatedHandler(handler);
    setCsrfCookie();
    server.use(http.post(`${API}/auth/login`, () => apiError(401, 'INVALID_CREDENTIALS')));

    await expect(api.post('/auth/login', {})).rejects.toMatchObject({
      code: 'INVALID_CREDENTIALS',
    });
    expect(handler).not.toHaveBeenCalled();
  });
});
