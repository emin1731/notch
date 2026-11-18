import { describe, expect, it } from 'vitest';
import { loginSchema, passwordSchema, registerSchema, usernameSchema } from './auth.js';

describe('usernameSchema', () => {
  it('trims and lower-cases', () => {
    expect(usernameSchema.parse('  Emin.D  ')).toBe('emin.d');
  });

  it.each(['abc', 'a_b-c.d', '0123456789', 'x'.repeat(50)])('accepts %s', (username) => {
    expect(usernameSchema.safeParse(username).success).toBe(true);
  });

  it.each(['ab', 'x'.repeat(51), 'with space', 'emoji🙂', 'at@sign', ''])('rejects %j', (u) => {
    expect(usernameSchema.safeParse(u).success).toBe(false);
  });
});

describe('passwordSchema', () => {
  it('requires 8 to 128 characters', () => {
    expect(passwordSchema.safeParse('1234567').success).toBe(false);
    expect(passwordSchema.safeParse('12345678').success).toBe(true);
    expect(passwordSchema.safeParse('x'.repeat(128)).success).toBe(true);
    expect(passwordSchema.safeParse('x'.repeat(129)).success).toBe(false);
  });
});

describe('registerSchema', () => {
  const valid = {
    username: 'Emin',
    password: 'correct horse',
    inviteCode: 'invite',
    timezone: 'Asia/Baku',
  };

  it('normalises the username and keeps the rest', () => {
    expect(registerSchema.parse(valid)).toEqual({ ...valid, username: 'emin' });
  });

  it('requires a valid timezone', () => {
    expect(registerSchema.safeParse({ ...valid, timezone: 'Nowhere' }).success).toBe(false);
  });

  it('trims a pasted invite code', () => {
    expect(registerSchema.parse({ ...valid, inviteCode: ' invite \n' }).inviteCode).toBe('invite');
  });

  it('explains what is wrong in words the form can show', () => {
    const result = registerSchema.safeParse({ ...valid, password: 'short', inviteCode: ' ' });
    expect(result.error?.issues.map(({ path, message }) => [path.join('.'), message])).toEqual([
      ['password', 'Use at least 8 characters'],
      ['inviteCode', 'Enter your invite code'],
    ]);
  });

  it('trims the optional name and rejects an empty one', () => {
    expect(registerSchema.parse({ ...valid, name: ' Emin ' }).name).toBe('Emin');
    expect(registerSchema.safeParse({ ...valid, name: '  ' }).success).toBe(false);
  });
});

describe('loginSchema', () => {
  it('asks for both fields', () => {
    const result = loginSchema.safeParse({ username: ' ', password: '' });
    expect(result.error?.issues.map((issue) => issue.message)).toEqual([
      'Enter your username',
      'Enter your password',
    ]);
  });

  it('lower-cases but does not apply the username pattern', () => {
    expect(loginSchema.parse({ username: ' A B ', password: 'x' })).toEqual({
      username: 'a b',
      password: 'x',
    });
  });
});
