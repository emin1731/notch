import { z } from 'zod';

/**
 * Express `trust proxy`: `false`, `true`, or the number of proxies in front of the app.
 * Use a hop count in production: with `true` the client IP is the left-most `X-Forwarded-For`
 * entry, which the client controls.
 */
const trustProxySchema = z
  .union([z.literal(['true', 'false']), z.string().regex(/^\d+$/)])
  .default('false')
  .transform((value) => (value === 'true' ? true : value === 'false' ? false : Number(value)));

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }),
  TRUST_PROXY: trustProxySchema,
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

  SESSION_TTL_DAYS: z.coerce.number().int().positive().default(30),
  /** Only switch off for local development over plain HTTP. */
  COOKIE_SECURE: z.stringbool().default(true),
  CSRF_SECRET: z.string().min(32, 'must be at least 32 characters'),
  INVITE_CODE: z.string().min(8, 'must be at least 8 characters'),
  MAX_USERS: z.coerce.number().int().min(1).default(1),
  /** The built web app, served on the same origin. Unset: API only. */
  WEB_DIST_DIR: z.string().min(1).optional(),
});

export type Env = z.infer<typeof envSchema>;

/** Used by ConfigModule at boot. Throws with every problem listed, so the app refuses to start. */
export function validateEnv(raw: Record<string, unknown>): Env {
  const result = envSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(`Invalid environment variables:\n${z.prettifyError(result.error)}`);
  }
  return result.data;
}
