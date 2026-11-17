import { describe, expect, it } from 'vitest';
import { changePasswordSchema, updateProfileSchema } from './user.js';

describe('updateProfileSchema', () => {
  it('accepts a name, a timezone or both', () => {
    expect(updateProfileSchema.parse({ name: 'Emin' })).toEqual({ name: 'Emin' });
    expect(updateProfileSchema.parse({ timezone: 'UTC' })).toEqual({ timezone: 'UTC' });
  });

  it('allows clearing the name with null', () => {
    expect(updateProfileSchema.parse({ name: null })).toEqual({ name: null });
  });

  it('rejects an empty update', () => {
    expect(updateProfileSchema.safeParse({}).success).toBe(false);
  });
});

describe('changePasswordSchema', () => {
  it('applies the password rules to the new password only', () => {
    expect(
      changePasswordSchema.safeParse({ currentPassword: 'x', newPassword: 'longenough' }).success,
    ).toBe(true);
    expect(
      changePasswordSchema.safeParse({ currentPassword: 'x', newPassword: 'short' }).success,
    ).toBe(false);
  });
});
