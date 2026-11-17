import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from '../src/app.module.js';
import { Clock } from '../src/clock/clock.js';
import { configureApp } from '../src/setup-app.js';

/** A clock the test moves by hand. Sessions still use real time. */
export class TestClock extends Clock {
  private current: Date;

  constructor(now: Date | string) {
    super();
    this.current = new Date(now);
  }

  override now(): Date {
    return new Date(this.current);
  }

  set(now: Date | string): void {
    this.current = new Date(now);
  }
}

export interface TestAppOptions {
  /** Serve a web build from this directory (WEB_DIST_DIR). */
  webDistDir?: string;
  /** Installs a TestClock at this instant; read it back with `testClock(app)` to move it. */
  now?: Date | string;
}

/** The real app (same modules, middleware and filters as production) on the test database. */
export async function createTestApp(options: TestAppOptions = {}): Promise<NestExpressApplication> {
  let builder = Test.createTestingModule({ imports: [AppModule] });
  if (options.now !== undefined) {
    builder = builder.overrideProvider(Clock).useValue(new TestClock(options.now));
  }
  const moduleRef = await builder.compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({ bufferLogs: true });
  configureApp(app, { webDistDir: options.webDistDir });
  await app.init();
  return app;
}

export function testClock(app: NestExpressApplication): TestClock {
  const clock = app.get(Clock);
  if (!(clock instanceof TestClock)) {
    throw new Error('Create the app with `now` to get a TestClock');
  }
  return clock;
}
