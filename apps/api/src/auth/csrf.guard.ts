import { type CanActivate, type ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { AppException } from '../common/errors/app-exception.js';
import { CsrfService } from './csrf.service.js';
import { readCookie } from './request-auth.js';
import { CSRF_COOKIE, CSRF_HEADER, csrfBinding, SESSION_COOKIE } from './tokens.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Global: every unsafe method, public routes included, must echo the `XSRF-TOKEN` cookie in the
 * `X-XSRF-TOKEN` header, and the token must be signed for the current session.
 */
@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(private readonly csrf: CsrfService) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(req.method)) {
      return true;
    }

    const header = req.get(CSRF_HEADER);
    const cookie = readCookie(req, CSRF_COOKIE);
    const binding = csrfBinding(readCookie(req, SESSION_COOKIE));
    if (!header || header !== cookie || !this.csrf.verify(header, binding)) {
      throw new AppException('CSRF_INVALID', HttpStatus.FORBIDDEN, 'Invalid or missing CSRF token');
    }
    return true;
  }
}
