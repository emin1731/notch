import { HttpStatus, NotFoundException, PayloadTooLargeException } from '@nestjs/common';
import { HttpException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { AppException } from '../errors/app-exception.js';
import { toErrorBody } from './all-exceptions.filter.js';

describe('toErrorBody', () => {
  it('renders an AppException as-is', () => {
    const error = new AppException('CORE_NOT_EMPTY', HttpStatus.CONFLICT, 'Core has habits', {
      habits: 2,
    });
    expect(toErrorBody(error)).toEqual({
      statusCode: 409,
      code: 'CORE_NOT_EMPTY',
      message: 'Core has habits',
      details: { habits: 2 },
    });
  });

  it('omits details when there are none', () => {
    const body = toErrorBody(new AppException('NOT_FOUND', HttpStatus.NOT_FOUND, 'Gone'));
    expect(body).not.toHaveProperty('details');
  });

  it('maps a ZodError to 400 VALIDATION_FAILED with issue paths', () => {
    const result = z.object({ name: z.string() }).safeParse({ name: 1 });
    const body = toErrorBody(result.error);
    expect(body).toMatchObject({ statusCode: 400, code: 'VALIDATION_FAILED' });
    expect(body.details).toEqual({
      issues: [expect.objectContaining({ path: 'name', code: 'invalid_type' })],
    });
  });

  it('maps Nest HTTP exceptions by status', () => {
    expect(toErrorBody(new NotFoundException())).toMatchObject({
      statusCode: 404,
      code: 'NOT_FOUND',
    });
    expect(toErrorBody(new PayloadTooLargeException())).toMatchObject({
      statusCode: 413,
      code: 'PAYLOAD_TOO_LARGE',
    });
  });

  it('falls back to BAD_REQUEST for unmapped 4xx and INTERNAL for unmapped 5xx', () => {
    expect(toErrorBody(new HttpException('Teapot', 418)).code).toBe('BAD_REQUEST');
    expect(toErrorBody(new HttpException('Bad gateway', 502)).code).toBe('INTERNAL');
  });

  it('hides unknown errors behind a generic 500', () => {
    expect(toErrorBody(new Error('db password is hunter2'))).toEqual({
      statusCode: 500,
      code: 'INTERNAL',
      message: 'Something went wrong',
    });
  });
});
