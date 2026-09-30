import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testServer } from './helpers';

let s: Awaited<ReturnType<typeof testServer>>;
beforeAll(async () => {
  s = await testServer();
});
afterAll(() => s.close());

let n = 0;
async function owner() {
  const token = await s.signUp(`budget${++n}@example.com`);
  await s.call('/api/business', { method: 'PUT', token, json: { name: 'Shop', type: 'restaurant', city: 'Jodhpur', employeeCount: 10 } });
  return token;
}
const limits = async (token: string) => ((await (await s.call('/api/budget', { token })).json()) as { limits: Record<string, number> }).limits;
const put = (token: string, category: string, amount: unknown) => s.call(`/api/budget/${category}`, { method: 'PUT', token, json: { amount } });
const errorOf = async (res: Response) => ((await res.json()) as { error: string }).error;

describe('budget', () => {
  it('starts with no own amounts, saves, changes and resets them', async () => {
    const t = await owner();
    expect(await limits(t)).toEqual({});
    expect((await put(t, 'suppliers', 400000)).status).toBe(200);
    expect((await put(t, 'personal', 0)).status).toBe(200); // ₹0 is a real budget
    expect(await limits(t)).toEqual({ suppliers: 400000, personal: 0 });
    await put(t, 'suppliers', 380000);
    expect((await limits(t)).suppliers).toBe(380000);
    expect((await s.call('/api/budget/suppliers', { method: 'DELETE', token: t })).status).toBe(204);
    expect(await limits(t)).toEqual({ personal: 0 });
  });

  it.each([
    ['sales', 1000, 'A budget can only be set for a spending category.'],
    ['casino', 1000, 'A budget can only be set for a spending category.'],
    ['rent', -1, "Budget can't be negative."],
    ['rent', 99.5, 'Budget must be in whole rupees.'],
    ['rent', '5000', 'Budget must be a number.'],
    ['rent', 10_00_00_001, 'That budget looks too large.'],
  ])('rejects %s = %j', async (category, amount, message) => {
    const t = await owner();
    const res = await put(t, category, amount);
    expect(res.status).toBe(400);
    expect(await errorOf(res)).toBe(message);
  });

  it('needs a business and a login', async () => {
    const noBiz = await s.signUp(`budget-nobiz${++n}@example.com`);
    expect(await limits(noBiz)).toEqual({});
    expect((await put(noBiz, 'rent', 5000)).status).toBe(409);
    expect((await s.call('/api/budget')).status).toBe(401);
  });

  it('one owner cannot see or change another’s budget', async () => {
    const a = await owner();
    const b = await owner();
    await put(a, 'rent', 68000);
    expect(await limits(b)).toEqual({});
    await s.call('/api/budget/rent', { method: 'DELETE', token: b });
    expect(await limits(a)).toEqual({ rent: 68000 });
  });
});
