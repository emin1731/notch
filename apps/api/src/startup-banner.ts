import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Logger } from 'nestjs-pino';
import { styleText } from 'node:util';
import type { Env } from './config/env.schema.js';
import { API_PREFIX } from './setup-app.js';

/** Where `pnpm dev` serves the web app (Vite, `strictPort` in apps/web/vite.config.ts). */
export const WEB_DEV_URL = 'http://localhost:5173';

export interface StartupInfo {
  nodeEnv: Env['NODE_ENV'];
  port: number;
  /** True when this process serves the built web app itself (WEB_DIST_DIR). */
  servesWeb: boolean;
  /** The Vite dev server's URL if it answered, else null. */
  webDevUrl: string | null;
  /** Swagger is only mounted in development. */
  docs: boolean;
  startedInSeconds: number;
}

type Style = (format: Parameters<typeof styleText>[0], text: string) => string;
const plain: Style = (_format, text) => text;

/**
 * The box printed once the API is listening, Spring Boot style: where the app, the API and its
 * docs are. `style` colours it (left out in tests).
 */
export function startupBanner(info: StartupInfo, style: Style = plain): string {
  const origin = `http://localhost:${info.port}`;
  const app = info.servesWeb ? origin : (info.webDevUrl ?? 'not running (pnpm dev starts it)');
  const rows: [string, string][] = [
    ['App', app],
    ['API', `${origin}/${API_PREFIX}`],
    ...(info.docs ? ([['Docs', `${origin}/docs`]] as [string, string][]) : []),
    ['Health', `${origin}/${API_PREFIX}/health`],
  ];
  const title = `notch is running · ${info.nodeEnv} · started in ${info.startedInSeconds.toFixed(1)} s`;

  const labelWidth = Math.max(...rows.map(([label]) => label.length));
  const lines = rows.map(([label, value]) => ({
    plain: `${label.padEnd(labelWidth)}   ${value}`,
    styled: `${style('dim', label.padEnd(labelWidth))}   ${value.startsWith('http') ? style('cyan', value) : style('yellow', value)}`,
  }));
  const width = Math.max(title.length, ...lines.map((line) => line.plain.length));
  const row = (styled: string, plainLength: number) =>
    `│  ${styled}${' '.repeat(width - plainLength)}  │`;

  return [
    `┌${'─'.repeat(width + 4)}┐`,
    row(style('bold', title), title.length),
    row('', 0),
    ...lines.map((line) => row(line.styled, line.plain.length)),
    `└${'─'.repeat(width + 4)}┘`,
  ].join('\n');
}

/** Whether something answers at `url` within a moment. */
async function reachable(url: string): Promise<boolean> {
  try {
    await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(800) });
    return true;
  } catch {
    return false;
  }
}

/**
 * Logs where everything is running, after `listen`. Through the app's logger, so it comes after
 * Nest's own startup lines. A box in development; one line in production (JSON logs).
 */
export async function logStartup(app: NestExpressApplication, servesWeb: boolean): Promise<void> {
  const config = app.get<ConfigService<Env, true>>(ConfigService);
  const logger = app.get(Logger);
  const nodeEnv = config.get('NODE_ENV', { infer: true });
  const port = config.get('PORT', { infer: true });

  if (nodeEnv !== 'development') {
    logger.log(`Listening on port ${port}${servesWeb ? ', serving the web app' : ''}`, 'Startup');
    return;
  }
  const banner = startupBanner(
    {
      nodeEnv,
      port,
      servesWeb,
      webDevUrl: !servesWeb && (await reachable(WEB_DEV_URL)) ? WEB_DEV_URL : null,
      docs: true,
      startedInSeconds: process.uptime(),
    },
    (format, text) => styleText(format, text, { stream: process.stdout }),
  );
  // No context argument: pino-pretty would print it after the box.
  logger.log(`\n${banner}`);
}
