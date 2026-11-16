import { Global, Injectable, Module } from '@nestjs/common';

/** The current instant. Injected so tests can move time (reviews, undo windows, backfill). */
@Injectable()
export class Clock {
  now(): Date {
    return new Date();
  }
}

@Global()
@Module({ providers: [Clock], exports: [Clock] })
export class ClockModule {}
