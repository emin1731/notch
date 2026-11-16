import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    // `prisma db seed`: the demo user. Runs from the build, like the other CLI scripts.
    seed: 'node dist/cli/seed.js',
  },
  datasource: {
    // Not read through env(): `prisma generate` must work without a database (e.g. in CI).
    url: process.env.DATABASE_URL ?? '',
    shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
  },
});
