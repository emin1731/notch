import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

/** Paths the SPA never owns: the API (JSON 404s stay JSON) and Swagger in development. */
const SERVER_PATHS = /^\/(api|docs)(\/|$)/;

/**
 * Serves the built web app from `dir` on the same origin as the API (plan 12.4). Hashed files under
 * /assets are cached for a year; everything else, index.html included, is revalidated on each load.
 * Any other GET that isn't an API path gets index.html, so client-side routes survive a reload.
 */
export function serveSpa(app: NestExpressApplication, dir: string): void {
  const root = resolve(dir);
  const index = join(root, 'index.html');
  if (!existsSync(index)) {
    throw new Error(`WEB_DIST_DIR has no index.html: ${root}`);
  }

  app.useStaticAssets(root, {
    index: false,
    setHeaders: (res, path) => {
      res.setHeader(
        'Cache-Control',
        path.startsWith(join(root, 'assets')) ? 'public, max-age=31536000, immutable' : 'no-cache',
      );
    },
  });
  app.use((req: Request, res: Response, next: NextFunction) => {
    if ((req.method !== 'GET' && req.method !== 'HEAD') || SERVER_PATHS.test(req.path)) {
      next();
      return;
    }
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(index);
  });
}
