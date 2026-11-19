import { zodResolver } from '@hookform/resolvers/zod';
import type { ErrorCode } from '@notch/shared';
import {
  type FieldValues,
  type Path,
  type Resolver,
  useForm,
  type UseFormProps,
  type UseFormReturn,
} from 'react-hook-form';
import type { z } from 'zod';
import { type ApiErrorCode, isApiError } from './api-client';

type FormSchema = z.ZodType<FieldValues, FieldValues>;

/** react-hook-form validated by a shared zod schema: the same rules the API applies. */
export function useZodForm<S extends FormSchema>(
  schema: S,
  options?: Omit<UseFormProps<z.input<S>, unknown, z.output<S>>, 'resolver'>,
): UseFormReturn<z.input<S>, unknown, z.output<S>> {
  // The resolver's overloads can't infer from a generic schema; the types line up by construction.
  const resolver = zodResolver(schema) as unknown as Resolver<z.input<S>, unknown, z.output<S>>;
  return useForm<z.input<S>, unknown, z.output<S>>({ ...options, resolver });
}

/** Error codes that belong to one field, in the words the form shows. */
const FIELD_MESSAGES: Partial<Record<ErrorCode, string>> = {
  USERNAME_TAKEN: 'That username is taken. Try another one.',
  INVALID_INVITE_CODE: "That invite code doesn't work. Check it and try again.",
};

const FORM_MESSAGES: Partial<Record<ApiErrorCode, string>> = {
  INVALID_CREDENTIALS: "That username and password don't match.",
  REGISTRATION_CLOSED: 'Registration is closed for now.',
  TOO_MANY_REQUESTS: 'Too many attempts. Try again in a minute.',
  NETWORK_ERROR: "Couldn't reach the server. Check your connection and try again.",
  CORE_ARCHIVED: 'This core is archived. Unarchive it first.',
  CORE_NOT_EMPTY:
    'This core still has goals or habits, archived ones included. Archive it instead, or delete those first.',
  LIMIT_REACHED: 'A goal can have up to 50 milestones.',
  GOAL_HAS_MILESTONES: 'This goal has milestones: it completes when they are all ticked.',
  CORE_NOT_FOUND: 'That core no longer exists.',
  GOAL_NOT_FOUND: 'That goal no longer exists.',
  MILESTONE_NOT_FOUND: 'That milestone no longer exists.',
  HABIT_NOT_FOUND: 'That habit no longer exists.',
  HABIT_ARCHIVED: 'This habit is archived. Unarchive it first.',
  GOAL_CORE_MISMATCH: 'That goal belongs to another core.',
};

export const FALLBACK_FORM_MESSAGE = 'Something went wrong. Try again in a moment.';

/** Words for any failed request, for a toast or a dialog. Never the server's raw message. */
export function apiErrorMessage(error: unknown): string {
  return (isApiError(error) && FORM_MESSAGES[error.code]) || FALLBACK_FORM_MESSAGE;
}

interface ValidationIssue {
  path: string;
  message: string;
}

/** `details.issues` of a `VALIDATION_FAILED` body (see the API's exception filter). */
function validationIssues(details: Record<string, unknown> | undefined): ValidationIssue[] {
  const issues = details?.issues;
  if (!Array.isArray(issues)) {
    return [];
  }
  return issues.filter(
    (issue): issue is ValidationIssue =>
      typeof issue === 'object' &&
      issue !== null &&
      typeof (issue as ValidationIssue).path === 'string' &&
      typeof (issue as ValidationIssue).message === 'string',
  );
}

export interface ServerErrorMapping<T extends FieldValues> {
  /** The fields the form shows. Problems with anything else are reported for the whole form. */
  fields: readonly Path<T>[];
  /** Error codes that point at one field, e.g. `USERNAME_TAKEN` → `username`. */
  codes?: Partial<Record<ErrorCode, Path<T>>>;
  /** When the form's fields aren't named like the API's, e.g. `targetValue` → `target`. */
  fieldForPath?: (path: string) => Path<T> | undefined;
}

/**
 * Puts a failed submit's error on the form: field problems on their fields (focusing the first),
 * the rest as one message for the whole form. Returns that message, or `null` if every problem
 * landed on a field.
 */
export function applyServerError<T extends FieldValues>(
  form: Pick<UseFormReturn<T>, 'setError'>,
  error: unknown,
  { fields, codes = {}, fieldForPath = (path) => path as Path<T> }: ServerErrorMapping<T>,
): string | null {
  if (!isApiError(error)) {
    return FALLBACK_FORM_MESSAGE;
  }

  const field = error.code === 'NETWORK_ERROR' ? undefined : codes[error.code];
  if (field) {
    const message = FIELD_MESSAGES[error.code as ErrorCode] ?? error.message;
    form.setError(field, { type: 'server', message }, { shouldFocus: true });
    return null;
  }

  if (error.code === 'VALIDATION_FAILED') {
    const known = new Set<string>(fields);
    const elsewhere: string[] = [];
    let shouldFocus = true;
    for (const issue of validationIssues(error.details)) {
      const field = fieldForPath(issue.path);
      if (field && known.has(field)) {
        form.setError(
          field,
          { type: 'server', message: issue.message },
          {
            shouldFocus,
          },
        );
        shouldFocus = false;
      } else {
        elsewhere.push(issue.path ? `${issue.path}: ${issue.message}` : issue.message);
      }
    }
    return elsewhere.length > 0 ? elsewhere.join(' ') : shouldFocus ? FALLBACK_FORM_MESSAGE : null;
  }

  return apiErrorMessage(error);
}
