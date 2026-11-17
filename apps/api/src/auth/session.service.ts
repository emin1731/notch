import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.schema.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { AuthUser } from './request-auth.js';
import { generateToken, sha256 } from './tokens.js';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface ValidSession {
  id: string;
  lastSeenAt: Date;
  user: AuthUser;
}

/** Server-side sessions. Only the SHA-256 of the cookie value is stored. */
@Injectable()
export class SessionService {
  readonly ttlMs: number;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService<Env, true>,
  ) {
    this.ttlMs = config.get('SESSION_TTL_DAYS', { infer: true }) * DAY_MS;
  }

  /** Starts a session and returns the raw token for the cookie. */
  async create(userId: string, userAgent: string | undefined): Promise<string> {
    const token = generateToken();
    await this.prisma.session.create({
      data: {
        tokenHash: sha256(token),
        userId,
        expiresAt: new Date(Date.now() + this.ttlMs),
        userAgent: userAgent?.slice(0, 500),
      },
    });
    return token;
  }

  /** The session with its user in one query, or null if it's unknown or expired. */
  async findValid(token: string): Promise<ValidSession | null> {
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: sha256(token) },
      select: {
        id: true,
        expiresAt: true,
        lastSeenAt: true,
        user: { select: { id: true, username: true, timezone: true } },
      },
    });
    if (!session || session.expiresAt.getTime() <= Date.now()) {
      return null;
    }
    return { id: session.id, lastSeenAt: session.lastSeenAt, user: session.user };
  }

  /** Sliding expiry, written at most once a day. Returns true when the session was extended. */
  async slideIfDue(session: ValidSession): Promise<boolean> {
    const now = Date.now();
    if (now - session.lastSeenAt.getTime() < DAY_MS) {
      return false;
    }
    const { count } = await this.prisma.session.updateMany({
      where: { id: session.id },
      data: { lastSeenAt: new Date(now), expiresAt: new Date(now + this.ttlMs) },
    });
    return count > 0;
  }

  async revoke(token: string): Promise<void> {
    await this.prisma.session.deleteMany({ where: { tokenHash: sha256(token) } });
  }

  /** Deletes every session of the user, except `keepSessionId` when given. */
  async revokeAllForUser(userId: string, keepSessionId?: string): Promise<void> {
    await this.prisma.session.deleteMany({
      where: { userId, ...(keepSessionId && { id: { not: keepSessionId } }) },
    });
  }

  async deleteExpiredForUser(userId: string): Promise<void> {
    await this.prisma.session.deleteMany({ where: { userId, expiresAt: { lte: new Date() } } });
  }
}
