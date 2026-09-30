import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testServer } from './helpers';

let s: Awaited<ReturnType<typeof testServer>>;
beforeAll(async () => {
  s = await testServer();
});
afterAll(() => s.close());

let n = 0;
async function owner() {
  const token = await s.signUp(`corr${++n}@example.com`);
  await s.call('/api/business', { method: 'PUT', token, json: { name: 'Shop', type: 'kirana', city: null, employeeCount: 1 } });
  return token;
}
const list = async (token: string) => ((await (await s.call('/api/corrections', { token })).json()) as { corrections: Record<string, string> }).corrections;
const put = (token: string, key: string, category: string) => s.call(`/api/corrections/${encodeURIComponent(key)}`, { method: 'PUT', token, json: { category } });
const errorOf = async (res: Response) => ((await res.json()) as { error: string }).error;

describe('corrections', () => {
  it('start empty, are saved, changed and removed', async () => {
    const t = await owner();
    expect(await list(t)).toEqual({});
    expect((await put(t, 'sureshpawar:D', 'salary')).status).toBe(200);
    expect((await put(t, 'amazon:D', 'suppliers')).status).toBe(200);
    expect(await list(t)).toEqual({ 'sureshpawar:D': 'salary', 'amazon:D': 'suppliers' });

    await put(t, 'amazon:D', 'personal');
    expect((await list(t))['amazon:D']).toBe('personal');

    expect((await s.call('/api/corrections/amazon%3AD', { method: 'DELETE', token: t })).status).toBe(204);
    expect(await list(t)).toEqual({ 'sureshpawar:D': 'salary' });
  });

  it('delete all (the ledger’s "undo my changes")', async () => {
    const t = await owner();
    await put(t, 'a1:D', 'rent');
    await put(t, 'b2:C', 'other_income');
    expect((await s.call('/api/corrections', { method: 'DELETE', token: t })).status).toBe(204);
    expect(await list(t)).toEqual({});
  });

  it('import moves corrections kept on the device, merging with saved ones', async () => {
    const t = await owner();
    await put(t, 'rent1:D', 'rent');
    const res = await s.call('/api/corrections/import', { method: 'POST', token: t, json: { corrections: { 'sureshpawar:D': 'salary', 'rent1:D': 'other' } } });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ corrections: { 'rent1:D': 'other', 'sureshpawar:D': 'salary' } });
  });

  it.each([
    ['ravi:C', 'salary', 'Money coming in can only be sales or other income.'],
    ['ravi:D', 'sales', 'Money going out can’t be sales or other income.'],
    ['ravi:D', 'casino', 'That is not one of Galla’s categories.'],
    ['Ravi Kumar:D', 'salary', 'That payee could not be recognised.'],
    ['ravi', 'salary', 'That payee could not be recognised.'],
  ])('rejects %s -> %s', async (key, category, message) => {
    const t = await owner();
    const res = await put(t, key, category);
    expect(res.status).toBe(400);
    expect(await errorOf(res)).toBe(message);
  });

  it('an import with one bad entry saves nothing', async () => {
    const t = await owner();
    const res = await s.call('/api/corrections/import', { method: 'POST', token: t, json: { corrections: { 'good:D': 'rent', 'bad:C': 'rent' } } });
    expect(res.status).toBe(400);
    expect(await list(t)).toEqual({});
  });

  it('need a business and a login', async () => {
    const noBiz = await s.signUp(`corr-nobiz${++n}@example.com`);
    expect(await list(noBiz)).toEqual({});
    expect((await put(noBiz, 'x1:D', 'rent')).status).toBe(409);
    expect((await s.call('/api/corrections')).status).toBe(401);
  });

  it('one owner cannot see or change another’s corrections', async () => {
    const a = await owner();
    const b = await owner();
    await put(a, 'sureshpawar:D', 'salary');
    expect(await list(b)).toEqual({});
    await s.call('/api/corrections', { method: 'DELETE', token: b });
    await s.call('/api/corrections/sureshpawar%3AD', { method: 'DELETE', token: b });
    expect(await list(a)).toEqual({ 'sureshpawar:D': 'salary' });
  });
});
