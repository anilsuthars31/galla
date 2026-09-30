/* Server configuration from environment variables, checked once at startup. A wrong value stops the
   server with a message that says what to put there, rather than failing later on a user's request. */
import { z } from 'zod';

const EXAMPLE_API_URL = 'https://galla-api.onrender.com';
const EXAMPLE_WEB = 'https://anilsuthars31.github.io';

const httpUrl = (what: string, example: string) =>
  z
    .string()
    .trim()
    .refine((s) => /^https?:\/\/[^\s/]+/i.test(s) && URL.canParse(s), `${what} must be a full address starting with https://, e.g. ${example}`);

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(8787),
  /** postgres://... in production; a PGlite folder locally. */
  DATABASE_URL: z.string().trim().min(1).default('./.data/galla'),
  /** Public URL of this API (used by the auth library for its own links). */
  BETTER_AUTH_URL: httpUrl('BETTER_AUTH_URL', EXAMPLE_API_URL).default('http://localhost:8787'),
  /** At least 32 random characters. Required in production. */
  BETTER_AUTH_SECRET: z.string().trim().min(32, 'BETTER_AUTH_SECRET must be at least 32 characters.').optional(),
  /**
   * Comma-separated web app addresses allowed to call the API. Only the origin counts, so
   * "https://anilsuthars31.github.io/galla/" is reduced to "https://anilsuthars31.github.io".
   */
  WEB_ORIGINS: z
    .string()
    .default('http://localhost:5173')
    .transform((s) =>
      s
        .split(',')
        .map((o) => o.trim())
        .filter(Boolean),
    )
    .pipe(z.array(httpUrl('Each WEB_ORIGINS entry', EXAMPLE_WEB)).min(1, 'WEB_ORIGINS needs at least one address.'))
    .transform((list) => [...new Set(list.map((o) => new URL(o).origin))]),
});

export type Env = z.infer<typeof schema> & { BETTER_AUTH_SECRET: string };

const DEV_SECRET = 'galla-local-development-secret-not-for-production';

export function loadEnv(source: Record<string, string | undefined> = process.env): Env {
  // Render sets RENDER_EXTERNAL_URL to the service's public address, so BETTER_AUTH_URL can be left unset there.
  const input = { ...source, BETTER_AUTH_URL: source.BETTER_AUTH_URL?.trim() || source.RENDER_EXTERNAL_URL || undefined };
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    throw new Error(`Invalid server configuration:\n${z.prettifyError(parsed.error)}`);
  }
  const env = parsed.data;
  if (env.NODE_ENV === 'production') {
    if (!env.BETTER_AUTH_SECRET) throw new Error('BETTER_AUTH_SECRET must be set in production (32+ random characters).');
    if (!/^postgres(ql)?:\/\//.test(env.DATABASE_URL)) {
      // Without this, production would quietly use a local file database that is wiped on every deploy.
      throw new Error('DATABASE_URL must be a postgres:// connection string in production (copy it from Neon).');
    }
  }
  return { ...env, BETTER_AUTH_SECRET: env.BETTER_AUTH_SECRET ?? DEV_SECRET };
}
