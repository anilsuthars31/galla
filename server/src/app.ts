/* The HTTP app. Built by a factory so tests get their own in-memory database. */
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { secureHeaders } from 'hono/secure-headers';
import { HTTPException } from 'hono/http-exception';
import { createAuth, type Auth } from './auth';
import { openDatabase, type Database } from './db/client';
import type { Env } from './env';
import { profileRoutes } from './routes/profile';

type SessionUser = Auth['$Infer']['Session']['user'];

export interface AppVars {
  Variables: { user: SessionUser | null };
}

export async function createServer(env: Env) {
  const database: Database = await openDatabase(env.DATABASE_URL);
  const auth = createAuth(database.db, env);
  const app = new Hono<AppVars>();

  app.use('*', secureHeaders());
  app.use(
    '/api/*',
    cors({
      origin: env.WEB_ORIGINS,
      allowHeaders: ['Content-Type', 'Authorization'],
      allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      exposeHeaders: ['set-auth-token'],
      maxAge: 600,
    }),
  );

  // Who is calling: resolved once per request from the Bearer token (or cookie).
  app.use('/api/*', async (c, next) => {
    const s = await auth.api.getSession({ headers: c.req.raw.headers });
    c.set('user', s?.user ?? null);
    await next();
  });

  app.get('/health', (c) => c.json({ ok: true }));

  app.on(['GET', 'POST'], '/api/auth/*', (c) => auth.handler(c.req.raw));

  app.get('/api/me', (c) => {
    const user = c.get('user');
    if (!user) throw new HTTPException(401, { message: 'Please log in again.' });
    return c.json({ id: user.id, name: user.name, email: user.email });
  });

  app.route('/api', profileRoutes(database.db));

  app.notFound((c) => c.json({ error: 'Not found' }, 404));
  app.onError((err, c) => {
    if (err instanceof HTTPException) return c.json({ error: err.message }, err.status);
    console.error(err);
    return c.json({ error: 'Something went wrong on our side. Please try again.' }, 500);
  });

  return { app, auth, close: database.close };
}
