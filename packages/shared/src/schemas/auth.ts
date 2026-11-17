import { z } from 'zod';
import { timezoneSchema } from '../timezone.js';

export const USERNAME_PATTERN = /^[a-z0-9_.-]{3,50}$/;
export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

/** Usernames are case-insensitive: trimmed and lower-cased before validation, storage and login. */
export const usernameSchema = z.string().trim().toLowerCase().regex(USERNAME_PATTERN, {
  message: '3–50 characters: letters, digits, dot, dash or underscore',
});

export const passwordSchema = z.string().min(PASSWORD_MIN_LENGTH).max(PASSWORD_MAX_LENGTH);

export const nameSchema = z.string().trim().min(1).max(80);

export const registerSchema = z.object({
  username: usernameSchema,
  password: passwordSchema,
  inviteCode: z.string().min(1).max(200),
  name: nameSchema.optional(),
  timezone: timezoneSchema,
});
export type RegisterInput = z.infer<typeof registerSchema>;

/**
 * Deliberately looser than registration: a username that could never exist still gets the same
 * 401 as a wrong password, instead of a 400 that tells it apart.
 */
export const loginSchema = z.object({
  username: z.string().trim().toLowerCase().min(1).max(50),
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
});
export type LoginInput = z.infer<typeof loginSchema>;
