import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CookieOptions, Response } from 'express';
import type { Env } from '../config/env.schema.js';
import { CsrfService } from './csrf.service.js';
import { SessionService } from './session.service.js';
import { CSRF_COOKIE, csrfBinding, SESSION_COOKIE } from './tokens.js';

@Injectable()
export class AuthCookiesService {
  private readonly base: CookieOptions;

  constructor(
    private readonly csrf: CsrfService,
    sessions: SessionService,
    config: ConfigService<Env, true>,
  ) {
    this.base = {
      secure: config.get('COOKIE_SECURE', { infer: true }),
      sameSite: 'lax',
      path: '/',
      maxAge: sessions.ttlMs,
    };
  }

  setSession(res: Response, token: string): void {
    res.cookie(SESSION_COOKIE, token, { ...this.base, httpOnly: true });
  }

  clearSession(res: Response): void {
    const { maxAge: _maxAge, ...options } = this.base;
    res.clearCookie(SESSION_COOKIE, { ...options, httpOnly: true });
  }

  /** Sets a fresh `XSRF-TOKEN` (readable by the SPA) bound to the given session, or to none. */
  issueCsrf(res: Response, sessionToken: string | undefined): void {
    res.cookie(CSRF_COOKIE, this.csrf.issue(csrfBinding(sessionToken)), {
      ...this.base,
      httpOnly: false,
    });
  }
}
