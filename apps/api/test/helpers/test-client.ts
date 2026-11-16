import type { NestExpressApplication } from '@nestjs/platform-express';
import request, { type Response } from 'supertest';
import { API_PREFIX } from '../../src/setup-app.js';

type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';

interface SendOptions {
  /** Override the X-XSRF-TOKEN header: `false` omits it, a string replaces it. */
  csrf?: false | string;
}

let lastIp = 0;
const nextIp = (): string => {
  lastIp += 1;
  return `10.0.${Math.floor(lastIp / 250)}.${(lastIp % 250) + 1}`;
};

/**
 * One browser: keeps its own cookies, echoes the XSRF-TOKEN cookie on unsafe methods like the SPA
 * will, and comes from its own IP (X-Forwarded-For; the test env trusts one proxy hop).
 */
export class TestClient {
  readonly cookies = new Map<string, string>();

  constructor(
    private server: ReturnType<NestExpressApplication['getHttpServer']>,
    readonly ip: string = nextIp(),
  ) {}

  /** The same browser talking to another app instance, e.g. after a restart. */
  withApp(app: NestExpressApplication): this {
    this.server = app.getHttpServer();
    return this;
  }

  get(path: string): Promise<Response> {
    return this.send('get', path);
  }

  post(path: string, body?: object, options?: SendOptions): Promise<Response> {
    return this.send('post', path, body, options);
  }

  patch(path: string, body?: object, options?: SendOptions): Promise<Response> {
    return this.send('patch', path, body, options);
  }

  put(path: string, body?: object, options?: SendOptions): Promise<Response> {
    return this.send('put', path, body, options);
  }

  delete(path: string, body?: object, options?: SendOptions): Promise<Response> {
    return this.send('delete', path, body, options);
  }

  /** Fetches the XSRF-TOKEN cookie, as the SPA does on load. */
  async csrf(): Promise<this> {
    await this.get('/auth/csrf');
    return this;
  }

  private async send(
    method: Method,
    path: string,
    body?: object,
    options: SendOptions = {},
  ): Promise<Response> {
    const req = request(this.server)[method](`/${API_PREFIX}${path}`);
    req.set('X-Forwarded-For', this.ip);
    if (this.cookies.size > 0) {
      req.set('Cookie', [...this.cookies].map(([name, value]) => `${name}=${value}`).join('; '));
    }
    if (method !== 'get') {
      const token = options.csrf === undefined ? this.cookies.get('XSRF-TOKEN') : options.csrf;
      if (token) {
        req.set('X-XSRF-TOKEN', token);
      }
    }
    const res = body === undefined ? await req : await req.send(body);
    this.storeCookies(res);
    return res;
  }

  private storeCookies(res: Response): void {
    const header = res.headers['set-cookie'] as string[] | string | undefined;
    for (const raw of [header ?? []].flat()) {
      const [pair = '', ...attributes] = raw.split(';');
      const separator = pair.indexOf('=');
      const name = pair.slice(0, separator).trim();
      const value = decodeURIComponent(pair.slice(separator + 1).trim());
      const expired = attributes.some((attribute) =>
        /^\s*expires=Thu, 01 Jan 1970/i.test(attribute),
      );
      if (expired || value === '') {
        this.cookies.delete(name);
      } else {
        this.cookies.set(name, value);
      }
    }
  }
}

/** Names of the cookies a response sets (cleared ones included). */
export function setCookieNames(res: Response): string[] {
  const header = res.headers['set-cookie'] as string[] | string | undefined;
  return [header ?? []].flat().map((raw) => raw.slice(0, raw.indexOf('=')));
}
