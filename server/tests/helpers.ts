import { createServer } from '../src/app';
import { loadEnv } from '../src/env';

export const WEB = 'http://localhost:5173';

/** A server with its own empty in-memory Postgres. */
export async function testServer() {
  const env = loadEnv({ NODE_ENV: 'test', DATABASE_URL: 'memory://', WEB_ORIGINS: WEB });
  const s = await createServer(env);

  const call = (path: string, init: RequestInit & { token?: string; json?: unknown } = {}) => {
    const headers = new Headers(init.headers);
    headers.set('Origin', WEB);
    if (init.token) headers.set('Authorization', `Bearer ${init.token}`);
    let body = init.body;
    if (init.json !== undefined) {
      headers.set('Content-Type', 'application/json');
      body = JSON.stringify(init.json);
    }
    return s.app.request(path, { ...init, headers, body });
  };

  /** Creates an account and returns its Bearer token. */
  const signUp = async (email = 'owner@example.com', password = 'correct-horse-9') => {
    const res = await call('/api/auth/sign-up/email', { method: 'POST', json: { email, password, name: 'Test Owner' } });
    if (res.status !== 200) throw new Error(`sign-up failed: ${res.status} ${await res.text()}`);
    const token = res.headers.get('set-auth-token');
    if (!token) throw new Error('sign-up returned no set-auth-token header');
    return token;
  };

  return { ...s, call, signUp };
}
