import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { loadEnv } from '../src/env';
import { testServer, WEB } from './helpers';

let s: Awaited<ReturnType<typeof testServer>>;
beforeAll(async () => {
  s = await testServer();
});
afterAll(() => s.close());

describe('health', () => {
  it('answers without a login', async () => {
    const res = await s.call('/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
  });
});

describe('accounts', () => {
  it('signs up, then /api/me returns the owner', async () => {
    const token = await s.signUp('asha@example.com');
    const res = await s.call('/api/me', { token });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ email: 'asha@example.com', name: 'Test Owner' });
  });

  it('logs in with the right password and gets a working token', async () => {
    await s.signUp('ravi@example.com', 'right-password-1');
    const res = await s.call('/api/auth/sign-in/email', { method: 'POST', json: { email: 'ravi@example.com', password: 'right-password-1' } });
    expect(res.status).toBe(200);
    const token = res.headers.get('set-auth-token');
    expect(token).toBeTruthy();
    const me = await s.call('/api/me', { token: token! });
    expect(me.status).toBe(200);
  });

  it('rejects a wrong password', async () => {
    await s.signUp('meena@example.com', 'right-password-1');
    const res = await s.call('/api/auth/sign-in/email', { method: 'POST', json: { email: 'meena@example.com', password: 'wrong-password-1' } });
    expect(res.status).toBe(401);
    expect(res.headers.get('set-auth-token')).toBeNull();
  });

  it('rejects a second account with the same email', async () => {
    await s.signUp('dup@example.com');
    const res = await s.call('/api/auth/sign-up/email', {
      method: 'POST',
      json: { email: 'dup@example.com', password: 'another-pass-1', name: 'Someone' },
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
  });

  it('rejects a password shorter than 8 characters', async () => {
    const res = await s.call('/api/auth/sign-up/email', { method: 'POST', json: { email: 'short@example.com', password: 'abc12', name: 'X' } });
    expect(res.status).toBe(400);
  });

  it('never returns the password hash', async () => {
    const res = await s.call('/api/auth/sign-up/email', {
      method: 'POST',
      json: { email: 'nohash@example.com', password: 'correct-horse-9', name: 'X' },
    });
    expect(await res.text()).not.toMatch(/password/i);
  });

  it('logging out invalidates the token', async () => {
    const token = await s.signUp('bye@example.com');
    const out = await s.call('/api/auth/sign-out', { method: 'POST', token, json: {} }); // same body the web app sends
    expect(out.status).toBe(200);
    const me = await s.call('/api/me', { token });
    expect(me.status).toBe(401);
  });
});

describe('error codes the web app translates (src/api/client.ts AUTH_MESSAGES)', () => {
  const codeOf = async (r: Response) => ((await r.json()) as { code: string }).code;

  it('wrong password', async () => {
    await s.signUp('codes1@example.com', 'right-password-1');
    const r = await s.call('/api/auth/sign-in/email', { method: 'POST', json: { email: 'codes1@example.com', password: 'nope-nope-1' } });
    expect(await codeOf(r)).toBe('INVALID_EMAIL_OR_PASSWORD');
  });

  it('email already used', async () => {
    await s.signUp('codes2@example.com');
    const r = await s.call('/api/auth/sign-up/email', { method: 'POST', json: { email: 'codes2@example.com', password: 'another-pass-1', name: 'X' } });
    expect(await codeOf(r)).toBe('USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL');
  });

  it('short password', async () => {
    const r = await s.call('/api/auth/sign-up/email', { method: 'POST', json: { email: 'codes3@example.com', password: 'abc', name: 'X' } });
    expect(await codeOf(r)).toBe('PASSWORD_TOO_SHORT');
  });

  it('malformed email', async () => {
    const r = await s.call('/api/auth/sign-up/email', { method: 'POST', json: { email: 'not-an-email', password: 'abcdefgh1', name: 'X' } });
    const body = (await r.json()) as { code: string; message: string };
    expect(body.code).toBe('VALIDATION_ERROR');
    expect(body.message).toMatch(/email/i);
  });
});

describe('protection', () => {
  it('/api/me without a token is 401 with a readable message', async () => {
    const res = await s.call('/api/me');
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Please log in again.' });
  });

  it('a made-up token is 401', async () => {
    const res = await s.call('/api/me', { token: 'not-a-real-token' });
    expect(res.status).toBe(401);
  });

  it('CORS allows the web app and exposes the token header', async () => {
    const res = await s.call('/api/me', { method: 'OPTIONS', headers: { 'Access-Control-Request-Method': 'GET' } });
    expect(res.headers.get('access-control-allow-origin')).toBe(WEB);
    const res2 = await s.call('/api/me');
    expect(res2.headers.get('access-control-expose-headers')).toContain('set-auth-token');
  });

  it('CORS does not allow other sites', async () => {
    const res = await s.app.request('/api/me', {
      method: 'OPTIONS',
      headers: { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'GET' },
    });
    expect(res.headers.get('access-control-allow-origin')).not.toBe('https://evil.example');
  });

  it('unknown routes are 404 JSON', async () => {
    const res = await s.call('/api/nope');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'Not found' });
  });
});

describe('configuration', () => {
  it('refuses to start in production without a secret', () => {
    expect(() => loadEnv({ NODE_ENV: 'production', DATABASE_URL: 'postgres://x' })).toThrow(/BETTER_AUTH_SECRET/);
  });

  it('reads a comma-separated origin list', () => {
    const env = loadEnv({ WEB_ORIGINS: 'https://a.example, https://b.example' });
    expect(env.WEB_ORIGINS).toEqual(['https://a.example', 'https://b.example']);
  });
});
