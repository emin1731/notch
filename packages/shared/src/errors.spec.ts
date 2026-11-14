import { describe, expect, it } from 'vitest';
import { ERROR_CODES, isErrorCode } from './errors.js';

describe('error codes', () => {
  it('are unique', () => {
    expect(new Set(ERROR_CODES).size).toBe(ERROR_CODES.length);
  });

  it('recognises known codes only', () => {
    expect(isErrorCode('NOT_FOUND')).toBe(true);
    expect(isErrorCode('NOPE')).toBe(false);
    expect(isErrorCode(404)).toBe(false);
  });
});
