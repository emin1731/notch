import { Controller, Delete, HttpCode, HttpStatus, Patch, Post, Res } from '@nestjs/common';
import {
  type ChangePasswordInput,
  changePasswordSchema,
  type DeleteAccountInput,
  deleteAccountSchema,
  type UpdateProfileInput,
  updateProfileSchema,
  type UserDto,
} from '@notch/shared';
import type { Response } from 'express';
import { AuthCookiesService } from '../auth/auth-cookies.service.js';
import { CurrentSessionId, CurrentUser } from '../auth/decorators.js';
import type { AuthUser } from '../auth/request-auth.js';
import { ZodBody } from '../common/pipes/zod-validation.pipe.js';
import { toUserDto } from './to-user-dto.js';
import { UsersService } from './users.service.js';

@Controller('me')
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly cookies: AuthCookiesService,
  ) {}

  /** A new timezone applies from the next request. */
  @Patch()
  async update(
    @CurrentUser() user: AuthUser,
    @ZodBody(updateProfileSchema) body: UpdateProfileInput,
  ): Promise<UserDto> {
    return toUserDto(await this.users.updateProfile(user.id, body));
  }

  @Post('password')
  @HttpCode(HttpStatus.NO_CONTENT)
  async changePassword(
    @CurrentUser() user: AuthUser,
    @CurrentSessionId() sessionId: string,
    @ZodBody(changePasswordSchema) body: ChangePasswordInput,
  ): Promise<void> {
    await this.users.changePassword(user.id, sessionId, body);
  }

  @Post('onboarding/complete')
  @HttpCode(HttpStatus.OK)
  async completeOnboarding(@CurrentUser() user: AuthUser): Promise<UserDto> {
    return toUserDto(await this.users.completeOnboarding(user.id));
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @CurrentUser() user: AuthUser,
    @ZodBody(deleteAccountSchema) body: DeleteAccountInput,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.users.deleteAccount(user.id, body.password);
    this.cookies.clearSession(res);
    this.cookies.issueCsrf(res, undefined);
  }
}
