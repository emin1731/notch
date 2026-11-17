import { describe, expect, it } from 'vitest';
import { validateEnv } from './env.schema.js';

const valid = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/notch',
  CSRF_SECRET: 'x'.repeat(32),
  INVITE_CODE: 'let-me-in',
};

describe('validateEnv', () => {
  it('applies defaults', () => {
    expect(validateEnv(valid)).toEqual({
      ...valid,
      NODE_ENV: 'development',
      PORT: 3000,
      TRUST_PROXY: false,
      LOG_LEVEL: 'info',
      SESSION_TTL_DAYS: 30,
      COOKIE_SECURE: true,
      MAX_USERS: 1,
      AUTH_THROTTLE_LIMIT: 10,
    });
  });

  it('parses strings from the environment', () => {
    const env = validateEnv({
      ...valid,
      PORT: '8080',
      COOKIE_SECURE: 'false',
      MAX_USERS: '3',
      AUTH_THROTTLE_LIMIT: '1000',
    });
    expect(env.PORT).toBe(8080);
    expect(env.COOKIE_SECURE).toBe(false);
    expect(env.MAX_USERS).toBe(3);
    expect(env.AUTH_THROTTLE_LIMIT).toBe(1000);
  });

  it.each([
    ['true', true],
    ['false', false],
    ['1', 1],
    ['2', 2],
  ])('parses TRUST_PROXY=%s', (raw, expected) => {
    expect(validateEnv({ ...valid, TRUST_PROXY: raw }).TRUST_PROXY).toBe(expected);
  });

  it('rejects an unknown TRUST_PROXY value', () => {
    expect(() => validateEnv({ ...valid, TRUST_PROXY: 'yes' })).toThrow(/TRUST_PROXY/);
  });

  it('rejects a short CSRF secret and invite code', () => {
    expect(() => validateEnv({ ...valid, CSRF_SECRET: 'short', INVITE_CODE: 'short' })).toThrow(
      /CSRF_SECRET[\s\S]*INVITE_CODE/,
    );
  });

  it('lists every problem when invalid', () => {
    expect(() => validateEnv({ ...valid, PORT: 'abc', DATABASE_URL: 'mysql://x' })).toThrow(
      /Invalid environment variables[\s\S]*PORT[\s\S]*DATABASE_URL/,
    );
  });

  it('rejects a missing database url', () => {
    expect(() => validateEnv({ ...valid, DATABASE_URL: undefined })).toThrow(/DATABASE_URL/);
  });
});
