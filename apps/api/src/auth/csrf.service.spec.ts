import type { ConfigService } from '@nestjs/config';
import { describe, expect, it } from 'vitest';
import type { Env } from '../config/env.schema.js';
import { CsrfService } from './csrf.service.js';
import { csrfBinding } from './tokens.js';

const serviceWith = (secret: string) =>
  new CsrfService({ get: () => secret } as unknown as ConfigService<Env, true>);

describe('CsrfService', () => {
  const csrf = serviceWith('s'.repeat(32));
  const binding = csrfBinding('session-token');

  it('verifies a token it issued for the same binding', () => {
    expect(csrf.verify(csrf.issue(binding), binding)).toBe(true);
  });

  it('issues a different token every time', () => {
    expect(csrf.issue(binding)).not.toBe(csrf.issue(binding));
  });

  it('rejects a token bound to another session, or to none', () => {
    const token = csrf.issue(csrfBinding(undefined));
    expect(csrf.verify(token, binding)).toBe(false);
    expect(csrf.verify(csrf.issue(binding), csrfBinding('other-session'))).toBe(false);
  });

  it('rejects a tampered signature or nonce', () => {
    const [nonce, signature] = csrf.issue(binding).split('.');
    expect(csrf.verify(`${nonce}.${signature?.slice(0, -1)}A`, binding)).toBe(false);
    expect(csrf.verify(`x${nonce}.${signature}`, binding)).toBe(false);
  });

  it('rejects a token signed with another secret', () => {
    expect(csrf.verify(serviceWith('t'.repeat(32)).issue(binding), binding)).toBe(false);
  });

  it.each(['', 'garbage', '.', 'a.b.c', 'a.'])('rejects %j', (token) => {
    expect(csrf.verify(token, binding)).toBe(false);
  });
});

describe('csrfBinding', () => {
  it('is "anon" without a session and the token hash with one', () => {
    expect(csrfBinding(undefined)).toBe('anon');
    expect(csrfBinding('abc')).toMatch(/^[0-9a-f]{64}$/);
  });
});
