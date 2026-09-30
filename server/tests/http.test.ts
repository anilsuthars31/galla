/* Over a real HTTP socket, not app.request(). Some behaviour only shows up on the wire: a POST sent by a
   browser always has a body stream, and better-auth rejects one without a Content-Type (found in the
   browser test: logout returned 415 and the session stayed valid). */
import type { AddressInfo } from 'node:net';
import { serve, type ServerType } from '@hono/node-server';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testServer, WEB } from './helpers';

let s: Awaited<ReturnType<typeof testServer>>;
let server: ServerType;
let base = '';

beforeAll(async () => {
  s = await testServer();
  server = serve({ fetch: s.app.fetch, port: 0 });
  await new Promise<void>((r) => server.once('listening', () => r()));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
  await s.close();
});

const post = (path: string, token?: string, body?: string) =>
  fetch(base + path, {
    method: 'POST',
    headers: {
      Origin: WEB,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body,
  });
const me = (token: string) => fetch(base + '/api/me', { headers: { Origin: WEB, Authorization: `Bearer ${token}` } });

async function signUp(email: string) {
  const res = await post('/api/auth/sign-up/email', undefined, JSON.stringify({ email, password: 'correct-horse-9', name: 'X' }));
  expect(res.status).toBe(200);
  return res.headers.get('set-auth-token')!;
}

describe('over real HTTP', () => {
  it('sign-out with a JSON body (what the web app sends) revokes the session', async () => {
    const token = await signUp('http1@example.com');
    expect((await me(token)).status).toBe(200);
    const out = await post('/api/auth/sign-out', token, '{}');
    expect(out.status).toBe(200);
    expect((await me(token)).status).toBe(401);
  });

  it('sign-out without a body is refused and the session stays valid (why the client must send {})', async () => {
    const token = await signUp('http2@example.com');
    const out = await post('/api/auth/sign-out', token);
    expect(out.status).toBe(415);
    expect((await me(token)).status).toBe(200);
  });

  it('CORS preflight from the web app succeeds', async () => {
    const res = await fetch(base + '/api/payees', {
      method: 'OPTIONS',
      headers: { Origin: WEB, 'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization,content-type' },
    });
    expect(res.status).toBeLessThan(300);
    expect(res.headers.get('access-control-allow-origin')).toBe(WEB);
    expect(res.headers.get('access-control-allow-headers')?.toLowerCase()).toContain('authorization');
  });
});
