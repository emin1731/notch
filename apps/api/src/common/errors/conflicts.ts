import { HttpStatus } from '@nestjs/common';
import { AppException } from './app-exception.js';

export const coreArchived = () =>
  new AppException(
    'CORE_ARCHIVED',
    HttpStatus.CONFLICT,
    'The core is archived. Unarchive it first.',
  );

export const goalCoreMismatch = (message: string, details?: Record<string, unknown>) =>
  new AppException('GOAL_CORE_MISMATCH', HttpStatus.CONFLICT, message, details);

/** A 400 in the same shape as a zod validation error, for rules checked outside a schema. */
export const validationFailed = (issues: { path: string; message: string }[]) =>
  new AppException('VALIDATION_FAILED', HttpStatus.BAD_REQUEST, 'Request validation failed', {
    issues: issues.map((issue) => ({ ...issue, code: 'custom' })),
  });
