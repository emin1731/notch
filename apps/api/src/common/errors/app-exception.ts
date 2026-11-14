import { HttpException, type HttpStatus } from '@nestjs/common';
import type { ApiErrorBody, ErrorCode } from '@notch/shared';

/** A domain error with a stable code. Rendered as-is by AllExceptionsFilter. */
export class AppException extends HttpException {
  readonly body: ApiErrorBody;

  constructor(
    code: ErrorCode,
    status: HttpStatus,
    message: string,
    details?: Record<string, unknown>,
  ) {
    const body: ApiErrorBody = { statusCode: status, code, message, ...(details && { details }) };
    super(body, status);
    this.body = body;
  }
}
