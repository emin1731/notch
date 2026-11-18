import { z } from 'zod';
import { timezoneSchema } from '../timezone.js';

export const USERNAME_PATTERN = /^[a-z0-9_.-]{3,50}$/;
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

/** Usernames are case-insensitive: trimmed and lower-cased before validation, storage and login. */
export const usernameSchema = z.string().trim().toLowerCase().regex(USERNAME_PATTERN, {
  message: '3–50 characters: letters, digits, dot, dash or underscore',
});

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters`)
  .max(PASSWORD_MAX_LENGTH, `Use at most ${PASSWORD_MAX_LENGTH} characters`);

export const nameSchema = z
  .string()
  .trim()
  .min(1, "The name can't be blank")
  .max(80, 'Use at most 80 characters');

export const registerSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
  inviteCode: z.string().trim().min(1, 'Enter your invite code').max(200),
  name: nameSchema.optional(),
  timezone: timezoneSchema,
});
export type RegisterInput = z.infer<typeof registerSchema>;

/**
 * Deliberately looser than registration: a username that could never exist still gets the same
 * 401 as a wrong password, instead of a 400 that tells it apart.
 */
export const loginSchema = z.object({
  username: z.string().trim().toLowerCase().min(1, 'Enter your username').max(50),
  password: z.string().min(1, 'Enter your password').max(PASSWORD_MAX_LENGTH),
});
export type LoginInput = z.infer<typeof loginSchema>;
