import { HttpStatus, Injectable } from '@nestjs/common';
import type { ChangePasswordInput, UpdateProfileInput } from '@notch/shared';
import { PasswordService } from '../auth/password.service.js';
import { SessionService } from '../auth/session.service.js';
import { AppException } from '../common/errors/app-exception.js';
import type { User } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
  ) {}

  updateProfile(userId: string, input: UpdateProfileInput): Promise<User> {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(input.name !== undefined && { name: input.name }),
        ...(input.timezone !== undefined && { timezone: input.timezone }),
      },
    });
  }

  /** Keeps the current session and ends every other one. */
  async changePassword(
    userId: string,
    currentSessionId: string,
    input: ChangePasswordInput,
  ): Promise<void> {
    await this.assertPassword(userId, input.currentPassword);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await this.passwords.hash(input.newPassword) },
    });
    await this.sessions.revokeAllForUser(userId, currentSessionId);
  }

  async completeOnboarding(userId: string): Promise<User> {
    await this.prisma.user.updateMany({
      where: { id: userId, onboardedAt: null },
      data: { onboardedAt: new Date() },
    });
    return this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
  }

  /** Irreversible: everything the user owns goes with it (cascade). */
  async deleteAccount(userId: string, password: string): Promise<void> {
    await this.assertPassword(userId, password);
    await this.prisma.user.delete({ where: { id: userId } });
  }

  /** 403 rather than 401: the session is fine, only the re-entered password is wrong. */
  private async assertPassword(userId: string, password: string): Promise<void> {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!(await this.passwords.verify(user.passwordHash, password))) {
      throw new AppException(
        'INVALID_CREDENTIALS',
        HttpStatus.FORBIDDEN,
        'Current password is incorrect',
      );
    }
  }
}
