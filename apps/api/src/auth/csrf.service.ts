import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { Env } from '../config/env.schema.js';

/**
 * Stateless CSRF tokens: `nonce.HMAC(CSRF_SECRET, nonce.binding)`. The binding is the session
 * (see `csrfBinding`), so a token issued before login stops working after it.
 */
@Injectable()
export class CsrfService {
  private readonly secret: string;

  constructor(config: ConfigService<Env, true>) {
    this.secret = config.get('CSRF_SECRET', { infer: true });
  }

  issue(binding: string): string {
    const nonce = randomBytes(32).toString('base64url');
    return `${nonce}.${this.sign(nonce, binding)}`;
  }

  verify(token: string, binding: string): boolean {
    const [nonce, signature, ...rest] = token.split('.');
    if (!nonce || !signature || rest.length > 0) {
      return false;
    }
    const expected = Buffer.from(this.sign(nonce, binding));
    const actual = Buffer.from(signature);
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  }

  private sign(nonce: string, binding: string): string {
    return createHmac('sha256', this.secret).update(`${nonce}.${binding}`).digest('base64url');
  }
}
