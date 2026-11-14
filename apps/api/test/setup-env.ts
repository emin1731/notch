import { inject } from 'vitest';

// Must run before AppModule is imported: ConfigModule validates the env at import time.
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
process.env.DATABASE_URL = inject('databaseUrl');
