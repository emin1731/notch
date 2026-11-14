import { describe, expect, it } from 'vitest';
import { z, ZodError } from 'zod';
import { ZodValidationPipe } from './zod-validation.pipe.js';

const schema = z.object({ name: z.string().min(1), count: z.coerce.number().default(1) });

describe('ZodValidationPipe', () => {
  const pipe = new ZodValidationPipe(schema);

  it('returns the parsed value, with coercion and defaults applied', () => {
    expect(pipe.transform({ name: 'Read' })).toEqual({ name: 'Read', count: 1 });
    expect(pipe.transform({ name: 'Read', count: '3' })).toEqual({ name: 'Read', count: 3 });
  });

  it('throws a ZodError for invalid input', () => {
    expect(() => pipe.transform({ name: '' })).toThrow(ZodError);
  });
});
