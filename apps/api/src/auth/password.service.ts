import { Injectable, type OnModuleInit } from '@nestjs/common';
import argon2 from 'argon2';
import { randomBytes } from 'node:crypto';

// argon2id with the library's defaults (m=64 MiB, t=3, p=4). The encoded hash carries its
// parameters, so raising them later rehashes old passwords on the next login.
const COST = { memoryCost: 65_536, timeCost: 3, parallelism: 4 };

@Injectable()
export class PasswordService implements OnModuleInit {
  /** Verified against when a username doesn't exist, so the response takes as long as a real one. */
  private dummyHash = '';

  async onModuleInit(): Promise<void> {
    this.dummyHash = await this.hash(randomBytes(16).toString('hex'));
  }

  hash(password: string): Promise<string> {
    return argon2.hash(password, { ...COST, type: argon2.argon2id });
  }

  async verify(hash: string, password: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, password);
    } catch {
      return false;
    }
  }

  /** Burns the same time as `verify` and always fails. */
  async verifyDummy(password: string): Promise<false> {
    await this.verify(this.dummyHash, password);
    return false;
  }

  /** True when the hash was made with older parameters and should be replaced on login. */
  needsRehash(hash: string): boolean {
    return argon2.needsRehash(hash, COST);
  }
}
