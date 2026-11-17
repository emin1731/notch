import { type CanActivate, type ExecutionContext, HttpStatus, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Response } from 'express';
import { AppException } from '../common/errors/app-exception.js';
import { AuthCookiesService } from './auth-cookies.service.js';
import { IS_PUBLIC_KEY } from './decorators.js';
import { type AuthedRequest, readCookie } from './request-auth.js';
import { SessionService } from './session.service.js';
import { SESSION_COOKIE } from './tokens.js';

/** Global: every route needs a valid session unless it's marked `@Public()`. */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionService,
    private readonly cookies: AuthCookiesService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const http = context.switchToHttp();
    const req = http.getRequest<AuthedRequest>();
    const token = readCookie(req, SESSION_COOKIE);
    const session = token ? await this.sessions.findValid(token) : null;
    if (!token || !session) {
      throw new AppException('UNAUTHENTICATED', HttpStatus.UNAUTHORIZED, 'Not logged in');
    }

    if (await this.sessions.slideIfDue(session)) {
      const res = http.getResponse<Response>();
      this.cookies.setSession(res, token);
      this.cookies.issueCsrf(res, token);
    }

    req.auth = { user: session.user, sessionId: session.id };
    return true;
  }
}
