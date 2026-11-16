import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { ConfigModule } from '../config/config.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';

/** Just what the account scripts need: no HTTP server, no request logging. */
@Module({
  imports: [ConfigModule, PrismaModule, AuthModule],
})
export class CliModule {}
