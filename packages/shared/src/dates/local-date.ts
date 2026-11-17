import { z } from 'zod';

/**
 * A user-local calendar date as "YYYY-MM-DD". Stored in `@db.Date` columns, which Prisma returns
 * as a Date at UTC midnight; these helpers are the only place that converts between the two.
 */
export type LocalDate = string;

const PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function isLocalDate(value: string): boolean {
  if (!PATTERN.test(value)) {
    return false;
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export const localDateSchema = z
  .string()
  .refine(isLocalDate, { message: 'Expected a date as YYYY-MM-DD' });

/** A `@db.Date` value from Prisma → "YYYY-MM-DD". */
export function toDateString(date: Date): LocalDate {
  return date.toISOString().slice(0, 10);
}

/** "YYYY-MM-DD" → the Date Prisma expects for a `@db.Date` column. */
export function fromDateString(value: LocalDate): Date {
  if (!isLocalDate(value)) {
    throw new RangeError(`Invalid local date: ${value}`);
  }
  return new Date(`${value}T00:00:00.000Z`);
}
