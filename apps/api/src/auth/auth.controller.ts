import { Controller, Get, HttpCode, HttpStatus, Post, Req, Res, UseGuards } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import {
  type LoginInput,
  loginSchema,
  type RegisterInput,
  registerSchema,
  type UserDto,
} from '@notch/shared';
import type { Request, Response } from 'express';
import { AppException } from '../common/errors/app-exception.js';
import { ZodBody } from '../common/pipes/zod-validation.pipe.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { toUserDto } from '../users/to-user-dto.js';
import { AuthCookiesService } from './auth-cookies.service.js';
import { AuthService } from './auth.service.js';
import { CurrentUser, Public } from './decorators.js';
import { type AuthUser, readCookie } from './request-auth.js';
import { SessionService } from './session.service.js';
import { SESSION_COOKIE } from './tokens.js';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessions: SessionService,
    private readonly cookies: AuthCookiesService,
    private readonly prisma: PrismaService,
  ) {}

  /** Sets the `XSRF-TOKEN` cookie. The SPA calls it once on load. */
  @Public()
  @Get('csrf')
  @HttpCode(HttpStatus.NO_CONTENT)
  csrf(@Req() req: Request, @Res({ passthrough: true }) res: Response): void {
    this.cookies.issueCsrf(res, readCookie(req, SESSION_COOKIE));
  }

  @Public()
  @UseGuards(ThrottlerGuard)
  @Post('register')
  async register(
    @ZodBody(registerSchema) body: RegisterInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<UserDto> {
    const user = await this.auth.register(body);
    await this.startSession(req, res, user.id);
    return toUserDto(user);
  }

  @Public()
  @UseGuards(ThrottlerGuard)
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @ZodBody(loginSchema) body: LoginInput,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<UserDto> {
    const user = await this.auth.login(body);
    await this.startSession(req, res, user.id);
    return toUserDto(user);
  }

  @Get('me')
  async me(@CurrentUser() current: AuthUser): Promise<UserDto> {
    const user = await this.prisma.user.findUnique({ where: { id: current.id } });
    if (!user) {
      throw new AppException('UNAUTHENTICATED', HttpStatus.UNAUTHORIZED, 'Not logged in');
    }
    return toUserDto(user);
  }

  /** Public, so an already-expired session can still clear its cookies. */
  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    const token = readCookie(req, SESSION_COOKIE);
    if (token) {
      await this.sessions.revoke(token);
    }
    this.endSession(res);
  }

  @Post('logout-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logoutAll(
    @CurrentUser() user: AuthUser,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.sessions.revokeAllForUser(user.id);
    this.endSession(res);
  }

  /** Always a fresh token (no session fixation); any session the browser already had is ended. */
  private async startSession(req: Request, res: Response, userId: string): Promise<void> {
    const previous = readCookie(req, SESSION_COOKIE);
    if (previous) {
      await this.sessions.revoke(previous);
    }
    const token = await this.sessions.create(userId, req.get('user-agent'));
    this.cookies.setSession(res, token);
    this.cookies.issueCsrf(res, token);
  }

  private endSession(res: Response): void {
    this.cookies.clearSession(res);
    this.cookies.issueCsrf(res, undefined);
  }
}
