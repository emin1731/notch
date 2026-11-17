import { Controller, Get, HttpStatus } from '@nestjs/common';
import { Public } from '../auth/decorators.js';
import { AppException } from '../common/errors/app-exception.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check(): Promise<{ status: 'ok'; db: 'ok' }> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      throw new AppException(
        'SERVICE_UNAVAILABLE',
        HttpStatus.SERVICE_UNAVAILABLE,
        'Database is unreachable',
      );
    }
    return { status: 'ok', db: 'ok' };
  }
}
