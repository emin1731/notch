import type { INestApplicationContext } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { passwordSchema } from '@notch/shared';
import { stdin, stdout } from 'node:process';
import { text } from 'node:stream/consumers';
import { z } from 'zod';
import { AppException } from '../common/errors/app-exception.js';
import { CliModule } from './cli.module.js';

/** An expected failure: printed without a stack trace. */
export class CliError extends Error {}

/** Boots the CLI module, runs the task, and turns known errors into a message and exit code 1. */
export async function runCli(task: (app: INestApplicationContext) => Promise<void>): Promise<void> {
  let app: INestApplicationContext | undefined;
  try {
    app = await NestFactory.createApplicationContext(CliModule, { logger: ['error'] });
    await task(app);
  } catch (error) {
    if (error instanceof CliError || error instanceof AppException) {
      console.error(`Error: ${error.message}`);
    } else if (error instanceof z.ZodError) {
      console.error(`Error:\n${z.prettifyError(error)}`);
    } else {
      console.error(error);
    }
    process.exitCode = 1;
  } finally {
    await app?.close();
  }
}

/**
 * Asks for a new password twice without echoing it. When stdin is piped, reads the first line
 * instead, so the scripts can be used non-interactively.
 */
export async function promptNewPassword(): Promise<string> {
  const password = stdin.isTTY
    ? await confirmHidden()
    : ((await text(stdin)).split(/\r?\n/)[0] ?? '');
  return passwordSchema.parse(password);
}

async function confirmHidden(): Promise<string> {
  const first = await promptHidden('New password: ');
  const second = await promptHidden('Repeat password: ');
  if (first !== second) {
    throw new CliError('Passwords do not match');
  }
  return first;
}

function promptHidden(question: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let value = '';
    const finish = (error?: Error) => {
      stdin.off('data', onData);
      stdin.setRawMode(false);
      stdin.pause();
      stdout.write('\n');
      if (error) {
        reject(error);
      } else {
        resolve(value);
      }
    };
    const onData = (chunk: string) => {
      for (const char of chunk) {
        if (char === '\r' || char === '\n') {
          return finish();
        }
        if (char === '\u0003') {
          return finish(new CliError('Cancelled'));
        }
        value = char === '\u007f' || char === '\b' ? value.slice(0, -1) : value + char;
      }
    };
    stdout.write(question);
    stdin.setEncoding('utf8');
    stdin.setRawMode(true);
    stdin.resume();
    stdin.on('data', onData);
  });
}
