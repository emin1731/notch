import { describe, expect, it, vi } from 'vitest';
import { AppException } from '../common/errors/app-exception.js';
import type { PrismaService } from '../prisma/prisma.service.js';
import { HealthController } from './health.controller.js';

describe('HealthController', () => {
  it('reports ok when the database answers', async () => {
    const prisma = { $queryRaw: vi.fn().mockResolvedValue([1]) } as unknown as PrismaService;
    await expect(new HealthController(prisma).check()).resolves.toEqual({ status: 'ok', db: 'ok' });
  });

  it('throws 503 SERVICE_UNAVAILABLE when the database is unreachable', async () => {
    const prisma = {
      $queryRaw: vi.fn().mockRejectedValue(new Error('ECONNREFUSED')),
    } as unknown as PrismaService;
    const error = await new HealthController(prisma).check().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AppException);
    expect((error as AppException).body).toMatchObject({
      statusCode: 503,
      code: 'SERVICE_UNAVAILABLE',
    });
  });
});
