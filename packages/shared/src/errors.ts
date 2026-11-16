/**
 * Stable error codes returned in every API error body. The web app switches on these,
 * so existing codes must never be renamed.
 */
export const ERROR_CODES = [
  // generic
  'BAD_REQUEST',
  'VALIDATION_FAILED',
  'FORBIDDEN',
  'NOT_FOUND',
  'PAYLOAD_TOO_LARGE',
  'TOO_MANY_REQUESTS',
  'SERVICE_UNAVAILABLE',
  'INTERNAL',
  // auth
  'UNAUTHENTICATED',
  'CSRF_INVALID',
  'INVALID_CREDENTIALS',
  'INVALID_INVITE_CODE',
  'REGISTRATION_CLOSED',
  'USERNAME_TAKEN',
  // domain
  'CORE_NOT_FOUND',
  'GOAL_NOT_FOUND',
  'MILESTONE_NOT_FOUND',
  'HABIT_NOT_FOUND',
  'CORE_ARCHIVED',
  'GOAL_HAS_MILESTONES',
  'LIMIT_REACHED',
  'UNDO_NOT_ALLOWED',
  'BACKFILL_OUT_OF_RANGE',
  'CORE_NOT_EMPTY',
  'GOAL_CORE_MISMATCH',
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

/** The JSON body of every non-2xx API response. */
export interface ApiErrorBody {
  statusCode: number;
  code: ErrorCode;
  message: string;
  details?: Record<string, unknown>;
}

export function isErrorCode(value: unknown): value is ErrorCode {
  return typeof value === 'string' && (ERROR_CODES as readonly string[]).includes(value);
}
