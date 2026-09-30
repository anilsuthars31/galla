import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiError } from '../../src/api/client';

type Call = { url: string; init: RequestInit };
function mockFetch(respond: (c: Call) => Response) {
  const calls: Call[] = [];
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    const c = { url, init };
    calls.push(c);
    return respond(c);
  });
  return calls;
}
const jsonRes = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });

afterEach(() => vi.unstubAllGlobals());

describe('api client', () => {
  it('log out sends a JSON body (a body-less POST is rejected with 415 over HTTP)', async () => {
    const calls = mockFetch(() => jsonRes({ success: true }));
    await api.logOut();
    const { init } = calls[0]!;
    expect(init.method).toBe('POST');
    expect(new Headers(init.headers).get('Content-Type')).toBe('application/json');
    expect(init.body).toBe('{}');
  });

  it('turns better-auth error codes into owner-friendly sentences', async () => {
    mockFetch(() => jsonRes({ code: 'INVALID_EMAIL_OR_PASSWORD', message: 'Invalid email or password' }, 401));
    await expect(api.logIn('a@b.co', 'x')).rejects.toThrow('That email and password don’t match. Check them and try again.');
  });

  it('maps a malformed-email validation error', async () => {
    mockFetch(() => jsonRes({ code: 'VALIDATION_ERROR', message: '[body.email] Invalid email address' }, 400));
    await expect(api.signUp('A', 'nope', 'password1')).rejects.toThrow('That doesn’t look like an email address.');
  });

  it('uses the API’s own { error } message for Galla routes', async () => {
    mockFetch(() => jsonRes({ error: 'Set up your business first.' }, 409));
    await expect(api.addPayee({ role: 'employee', name: 'X', amount: null, day: null, aliases: [] })).rejects.toThrow('Set up your business first.');
  });

  it('a network failure is status 0 with a readable message', async () => {
    vi.stubGlobal('fetch', async () => {
      throw new TypeError('Failed to fetch');
    });
    const err = await api.me().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(0);
    expect((err as ApiError).message).toMatch(/Can’t reach Galla/);
  });

  it('handles 204 No Content', async () => {
    mockFetch(() => new Response(null, { status: 204 }));
    await expect(api.deletePayee('p1')).resolves.toBeUndefined();
  });
});
