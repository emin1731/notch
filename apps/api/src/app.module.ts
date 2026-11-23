import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
import { LoggerModule } from 'nestjs-pino';
import { AuthModule } from './auth/auth.module.js';
import { ClockModule } from './clock/clock.js';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';
import { ConfigModule } from './config/config.module.js';
import { CoresModule } from './cores/cores.module.js';
import { HabitsModule } from './habits/habits.module.js';
import type { Env } from './config/env.schema.js';
import { HealthModule } from './health/health.module.js';
import { LogsModule } from './logs/logs.module.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { ReviewsModule } from './reviews/reviews.module.js';
import { StatsModule } from './stats/stats.module.js';
import { TodayModule } from './today/today.module.js';
import { UsersModule } from './users/users.module.js';

@Module({
  imports: [
    ConfigModule,
    LoggerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService<Env, true>) => ({
        pinoHttp: {
          level: config.get('LOG_LEVEL', { infer: true }),
          transport:
            config.get('NODE_ENV', { infer: true }) === 'development'
              ? { target: 'pino-pretty', options: { singleLine: true } }
              : undefined,
          // Session cookies and CSRF tokens must never reach the logs.
          redact: [
            'req.headers.cookie',
            'req.headers["x-xsrf-token"]',
            'res.headers["set-cookie"]',
          ],
        },
      }),
    }),
    PrismaModule,
    ClockModule,
    AuthModule,
    UsersModule,
    CoresModule,
    HabitsModule,
    LogsModule,
    ReviewsModule,
    StatsModule,
    TodayModule,
    HealthModule,
  ],
  providers: [{ provide: APP_FILTER, useClass: AllExceptionsFilter }],
})
export class AppModule {}
