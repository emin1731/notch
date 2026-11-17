import { describe, expect, it } from 'vitest';
import { validateEnv } from './env.schema.js';

const valid = { DATABASE_URL: 'postgresql://u:p@localhost:5432/notch' };

describe('validateEnv', () => {
  it('applies defaults', () => {
    expect(validateEnv(valid)).toEqual({
      ...valid,
      NODE_ENV: 'development',
      PORT: 3000,
      TRUST_PROXY: false,
      LOG_LEVEL: 'info',
    });
  });

  it('parses strings from the environment', () => {
    const env = validateEnv({ ...valid, PORT: '8080', TRUST_PROXY: 'true' });
    expect(env.PORT).toBe(8080);
    expect(env.TRUST_PROXY).toBe(true);
  });

  it('lists every problem when invalid', () => {
    expect(() => validateEnv({ PORT: 'abc', DATABASE_URL: 'mysql://x' })).toThrow(
      /Invalid environment variables[\s\S]*PORT[\s\S]*DATABASE_URL/,
    );
  });

  it('rejects a missing database url', () => {
    expect(() => validateEnv({})).toThrow(/DATABASE_URL/);
  });
});
