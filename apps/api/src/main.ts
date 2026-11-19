import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import type { Env } from './config/env.schema.js';
import { configureApp } from './setup-app.js';
import { logStartup } from './startup-banner.js';

const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
const config = app.get<ConfigService<Env, true>>(ConfigService);
configureApp(app);
await app.listen(config.get('PORT', { infer: true }));
await logStartup(app, Boolean(config.get('WEB_DIST_DIR', { infer: true })));
