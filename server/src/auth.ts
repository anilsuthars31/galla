/* Accounts: email + password via better-auth (hashing, sessions and rate limits are the library's job).
   The web app and the API live on different sites (GitHub Pages and the API host), where browsers may
   block cookies, so the web app sends the session token as a Bearer header instead (see D12). */
import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { bearer } from 'better-auth/plugins/bearer';
import type { Db } from './db/client';
import * as schema from './db/schema';
import type { Env } from './env';

export function createAuth(db: Db, env: Env) {
  return betterAuth({
    appName: 'Galla',
    baseURL: env.BETTER_AUTH_URL,
    basePath: '/api/auth',
    secret: env.BETTER_AUTH_SECRET,
    trustedOrigins: env.WEB_ORIGINS,
    database: drizzleAdapter(db, { provider: 'pg', schema }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      autoSignIn: true,
    },
    session: {
      expiresIn: 60 * 60 * 24 * 30, // 30 days: a shop owner should not have to log in every week
      updateAge: 60 * 60 * 24,
    },
    rateLimit: { enabled: env.NODE_ENV === 'production' },
    telemetry: { enabled: false },
    plugins: [bearer()],
  });
}

export type Auth = ReturnType<typeof createAuth>;
