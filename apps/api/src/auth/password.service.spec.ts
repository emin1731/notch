import argon2 from 'argon2';
import { beforeAll, describe, expect, it } from 'vitest';
import { PasswordService } from './password.service.js';

describe('PasswordService', () => {
  const passwords = new PasswordService();

  beforeAll(async () => {
    await passwords.onModuleInit();
  });

  it('hashes with argon2id and verifies', async () => {
    const hash = await passwords.hash('correct horse');
    expect(hash).toMatch(/^\$argon2id\$/);
    expect(await passwords.verify(hash, 'correct horse')).toBe(true);
    expect(await passwords.verify(hash, 'wrong horse')).toBe(false);
  });

  it('treats a malformed hash as a failed check', async () => {
    expect(await passwords.verify('not-a-hash', 'x')).toBe(false);
  });

  it('dummy verification always fails', async () => {
    expect(await passwords.verifyDummy('anything')).toBe(false);
  });

  it('flags hashes made with weaker parameters for rehashing', async () => {
    const weak = await argon2.hash('pw', {
      type: argon2.argon2id,
      timeCost: 2,
      memoryCost: 19_456,
    });
    expect(passwords.needsRehash(weak)).toBe(true);
    expect(passwords.needsRehash(await passwords.hash('pw'))).toBe(false);
  });
});
