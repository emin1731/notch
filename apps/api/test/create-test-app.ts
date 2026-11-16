import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from '../src/app.module.js';
import { Clock } from '../src/clock/clock.js';
import { configureApp } from '../src/setup-app.js';

export interface TestAppOptions {
  /** Freezes the Clock that services read "now" from. Sessions still use real time. */
  now?: Date | string;
}

/** The real app (same modules, middleware and filters as production) on the test database. */
export async function createTestApp(options: TestAppOptions = {}): Promise<NestExpressApplication> {
  let builder = Test.createTestingModule({ imports: [AppModule] });
  if (options.now !== undefined) {
    const now = new Date(options.now);
    builder = builder.overrideProvider(Clock).useValue({ now: () => new Date(now) });
  }
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true });
  configureApp(app);
  await app.init();
  return app;
}
