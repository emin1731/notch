import type { NestExpressApplication } from '@nestjs/platform-express';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestApp } from './create-test-app.js';

describe('serving the web app (e2e)', () => {
  let app: NestExpressApplication;
  let dir: string;
  const get = (path: string) => request(app.getHttpServer()).get(path);

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'notch-web-'));
    mkdirSync(join(dir, 'assets'));
    writeFileSync(join(dir, 'index.html'), '<!doctype html><title>notch</title>');
    writeFileSync(join(dir, 'assets', 'app-1a2b3c.js'), 'console.log(1)');
    writeFileSync(join(dir, 'favicon.svg'), '<svg/>');
    app = await createTestApp({ webDistDir: dir });
  });

  afterAll(async () => {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('serves index.html at the root and for client routes, revalidated each time', async () => {
    for (const path of ['/', '/today', '/habits/123/stats']) {
      const res = await get(path).expect(200);
      expect(res.text).toContain('<title>notch</title>');
      expect(res.headers['cache-control']).toBe('no-cache');
    }
  });

  it('caches hashed assets for a year, and other files not', async () => {
    const asset = await get('/assets/app-1a2b3c.js').expect(200);
    expect(asset.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect((await get('/favicon.svg').expect(200)).headers['cache-control']).toBe('no-cache');
  });

  it('leaves the API alone: unknown API paths are still JSON 404s', async () => {
    expect((await get('/api/v1/health').expect(200)).body.status).toBe('ok');
    const missing = await get('/api/v1/nope').expect(404);
    expect(missing.body).toMatchObject({ code: 'NOT_FOUND' });
    expect((await get('/api').expect(404)).text).not.toContain('<title>notch</title>');
  });

  it('only answers GET and HEAD with the app', async () => {
    const res = await request(app.getHttpServer()).post('/today').expect(404);
    expect(res.text).not.toContain('<title>notch</title>');
  });

  it('refuses to start without an index.html', async () => {
    const empty = mkdtempSync(join(tmpdir(), 'notch-web-'));
    await expect(createTestApp({ webDistDir: empty })).rejects.toThrow(/no index.html/);
    rmSync(empty, { recursive: true, force: true });
  });
});
