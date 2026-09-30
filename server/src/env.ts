/* Server configuration from environment variables, checked once at startup. */
import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(8787),
  /** postgres://... in production; a PGlite folder locally. */
  DATABASE_URL: z.string().min(1).default('./.data/galla'),
  /** Public URL of this API (used by the auth library for its own links). */
  BETTER_AUTH_URL: z.url().default('http://localhost:8787'),
  /** At least 32 random characters. Required in production. */
  BETTER_AUTH_SECRET: z.string().min(32).optional(),
  /** Comma-separated origins allowed to call the API (the web app). */
  WEB_ORIGINS: z
    .string()
    .default('http://localhost:5173')
    .transform((s) =>
      s
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean),
    ),
});

export type Env = z.infer<typeof schema> & { BETTER_AUTH_SECRET: string };

const DEV_SECRET = 'galla-local-development-secret-not-for-production';

export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    throw new Error(`Invalid server configuration:\n${z.prettifyError(parsed.error)}`);
  }
  const env = parsed.data;
  if (env.NODE_ENV === 'production' && !env.BETTER_AUTH_SECRET) {
    throw new Error('BETTER_AUTH_SECRET must be set in production (32+ random characters).');
  }
  return { ...env, BETTER_AUTH_SECRET: env.BETTER_AUTH_SECRET ?? DEV_SECRET };
}
