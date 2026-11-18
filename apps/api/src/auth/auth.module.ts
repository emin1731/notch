import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import type { Env } from '../config/env.schema.js';
import { AuthCookiesService } from './auth-cookies.service.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { CsrfGuard } from './csrf.guard.js';
import { CsrfService } from './csrf.service.js';
import { PasswordService } from './password.service.js';
import { SessionGuard } from './session.guard.js';
import { SessionService } from './session.service.js';

@Module({
  imports: [
    // Applied only to login and register, via @UseGuards(ThrottlerGuard).
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        throttlers: [{ ttl: 60_000, limit: config.get('AUTH_THROTTLE_LIMIT', { infer: true }) }],
        errorMessage: 'Too many attempts. Try again in a minute.',
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [
    AuthService,
    AuthCookiesService,
    CsrfService,
    PasswordService,
    SessionService,
    // Order matters: authenticate first, then check CSRF.
    { provide: APP_GUARD, useClass: SessionGuard },
    { provide: APP_GUARD, useClass: CsrfGuard },
  ],
  exports: [AuthService, AuthCookiesService, PasswordService, SessionService],
})
export class AuthModule {}
