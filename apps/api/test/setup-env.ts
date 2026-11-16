import { inject } from 'vitest';

// Must run before AppModule is imported: ConfigModule validates the env at import time.
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
process.env.DATABASE_URL = inject('databaseUrl');
// One trusted hop, so each test client can pose as its own IP via X-Forwarded-For.
process.env.TRUST_PROXY = '1';
process.env.COOKIE_SECURE = 'false';
process.env.CSRF_SECRET = 'test-csrf-secret-0123456789abcdefghij';
process.env.INVITE_CODE = 'test-invite-code';
process.env.MAX_USERS = '3';
process.env.SESSION_TTL_DAYS = '30';
