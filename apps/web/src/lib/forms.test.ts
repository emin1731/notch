import { describe, expect, it, vi } from 'vitest';
import { ApiError } from './api-client';
import { applyServerError, FALLBACK_FORM_MESSAGE } from './forms';

type Values = { username: string; password: string; inviteCode: string; timezone: string };

const mapping = {
  fields: ['username', 'password', 'inviteCode'] as const,
  codes: { USERNAME_TAKEN: 'username', INVALID_INVITE_CODE: 'inviteCode' } as const,
};

function setup() {
  const setError = vi.fn();
  return { setError, form: { setError } };
}

describe('applyServerError', () => {
  it('puts a field error code on its field', () => {
    const { form, setError } = setup();
    const error = new ApiError(409, 'USERNAME_TAKEN', 'That username is taken');

    expect(applyServerError<Values>(form, error, mapping)).toBeNull();
    expect(setError).toHaveBeenCalledWith(
      'username',
      { type: 'server', message: 'That username is taken. Try another one.' },
      { shouldFocus: true },
    );
  });

  it('puts validation issues on their fields and focuses the first', () => {
    const { form, setError } = setup();
    const error = new ApiError(400, 'VALIDATION_FAILED', 'Request validation failed', {
      issues: [
        { path: 'username', code: 'invalid_format', message: 'Bad username' },
        { path: 'password', code: 'too_small', message: 'Too short' },
      ],
    });

    expect(applyServerError<Values>(form, error, mapping)).toBeNull();
    expect(setError).toHaveBeenNthCalledWith(
      1,
      'username',
      { type: 'server', message: 'Bad username' },
      { shouldFocus: true },
    );
    expect(setError).toHaveBeenNthCalledWith(
      2,
      'password',
      { type: 'server', message: 'Too short' },
      { shouldFocus: false },
    );
  });

  it('reports issues with fields the form does not show for the whole form', () => {
    const { form, setError } = setup();
    const error = new ApiError(400, 'VALIDATION_FAILED', 'Request validation failed', {
      issues: [{ path: 'timezone', code: 'custom', message: 'Unknown timezone' }],
    });

    expect(applyServerError<Values>(form, error, mapping)).toBe('timezone: Unknown timezone');
    expect(setError).not.toHaveBeenCalled();
  });

  it.each([
    ['INVALID_CREDENTIALS', 401, "That username and password don't match."],
    ['REGISTRATION_CLOSED', 403, 'Registration is closed for now.'],
    ['TOO_MANY_REQUESTS', 429, 'Too many attempts. Try again in a minute.'],
    ['NETWORK_ERROR', 0, "Couldn't reach the server. Check your connection and try again."],
    ['INTERNAL', 500, FALLBACK_FORM_MESSAGE],
    ['CSRF_INVALID', 403, FALLBACK_FORM_MESSAGE],
  ] as const)('reports %s for the whole form', (code, status, message) => {
    const { form, setError } = setup();
    expect(applyServerError<Values>(form, new ApiError(status, code, 'raw'), mapping)).toBe(
      message,
    );
    expect(setError).not.toHaveBeenCalled();
  });

  it('falls back for something that is not an API error', () => {
    const { form } = setup();
    expect(applyServerError<Values>(form, new TypeError('boom'), mapping)).toBe(
      FALLBACK_FORM_MESSAGE,
    );
  });
});
