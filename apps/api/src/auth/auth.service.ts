import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { LoginInput, RegisterInput } from '@notch/shared';
import { createHash, timingSafeEqual } from 'node:crypto';
import { AppException } from '../common/errors/app-exception.js';
import { isUniqueViolation } from '../common/prisma/is-unique-violation.js';
import type { Env } from '../config/env.schema.js';
import type { User } from '../generated/prisma/client.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { PasswordService } from './password.service.js';
import { SessionService } from './session.service.js';

export interface NewUser {
  username: string;
  password: string;
  name?: string | null;
  timezone: string;
}

const digest = (value: string): Buffer => createHash('sha256').update(value).digest();

/** Credentials: registration, login, and the account operations the CLI also uses. */
@Injectable()
export class AuthService {
  private readonly inviteCodeDigest: Buffer;
  private readonly maxUsers: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
    config: ConfigService<Env, true>,
  ) {
    this.inviteCodeDigest = digest(config.get('INVITE_CODE', { infer: true }));
    this.maxUsers = config.get('MAX_USERS', { infer: true });
  }

  async register(input: RegisterInput): Promise<User> {
    if (!timingSafeEqual(digest(input.inviteCode), this.inviteCodeDigest)) {
      throw new AppException('INVALID_INVITE_CODE', HttpStatus.FORBIDDEN, 'Invalid invite code');
    }
    if ((await this.prisma.user.count()) >= this.maxUsers) {
      throw new AppException('REGISTRATION_CLOSED', HttpStatus.FORBIDDEN, 'Registration is closed');
    }
    return this.createUser(input);
  }

  /** Same 401 for an unknown username and a wrong password, after the same amount of work. */
  async login(input: LoginInput): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { username: input.username } });
    const valid = user
      ? await this.passwords.verify(user.passwordHash, input.password)
      : await this.passwords.verifyDummy(input.password);
    if (!user || !valid) {
      throw new AppException(
        'INVALID_CREDENTIALS',
        HttpStatus.UNAUTHORIZED,
        'Invalid username or password',
      );
    }

    if (this.passwords.needsRehash(user.passwordHash)) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: await this.passwords.hash(input.password) },
      });
    }
    await this.sessions.deleteExpiredForUser(user.id);
    return user;
  }

  /** Creates a user without checking the invite code or MAX_USERS (register checks those). */
  async createUser(input: NewUser): Promise<User> {
    const passwordHash = await this.passwords.hash(input.password);
    try {
      return await this.prisma.user.create({
        data: {
          username: input.username,
          passwordHash,
          name: input.name ?? null,
          timezone: input.timezone,
        },
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new AppException('USERNAME_TAKEN', HttpStatus.CONFLICT, 'That username is taken', {
          field: 'username',
        });
      }
      throw error;
    }
  }

  /** Replaces the password and logs the user out everywhere. Used by the CLI. */
  async setPassword(username: string, password: string): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { username } });
    if (!user) {
      throw new AppException('NOT_FOUND', HttpStatus.NOT_FOUND, `No user named "${username}"`);
    }
    const updated = await this.prisma.user.update({
      where: { id: user.id },
      data: { passwordHash: await this.passwords.hash(password) },
    });
    await this.sessions.revokeAllForUser(user.id);
    return updated;
  }
}
