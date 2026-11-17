import { z } from 'zod';
import { timezoneSchema } from '../timezone.js';
import { nameSchema, PASSWORD_MAX_LENGTH, passwordSchema } from './auth.js';

export const updateProfileSchema = z
  .object({
    name: nameSchema.nullable().optional(),
    timezone: timezoneSchema.optional(),
  })
  .refine((value) => value.name !== undefined || value.timezone !== undefined, {
    message: 'Nothing to update',
  });
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(PASSWORD_MAX_LENGTH),
  newPassword: passwordSchema,
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const deleteAccountSchema = z.object({
  password: z.string().min(1).max(PASSWORD_MAX_LENGTH),
});
export type DeleteAccountInput = z.infer<typeof deleteAccountSchema>;
