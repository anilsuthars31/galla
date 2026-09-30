import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { testServer } from './helpers';

let s: Awaited<ReturnType<typeof testServer>>;
beforeAll(async () => {
  s = await testServer();
});
afterAll(() => s.close());

const SHOP = { name: 'Sharma Kirana', type: 'kirana', city: 'Pune', employeeCount: 2 };
let n = 0;
const newOwner = () => s.signUp(`owner${++n}@example.com`);
const setUp = async (token: string) => {
  const res = await s.call('/api/business', { method: 'PUT', token, json: SHOP });
  expect(res.status).toBe(200);
};
const addPayee = (token: string, json: unknown) => s.call('/api/payees', { method: 'POST', token, json });
const errorOf = async (res: Response) => ((await res.json()) as { error: string }).error;

describe('business profile', () => {
  it('is null for a new account', async () => {
    const token = await newOwner();
    const res = await s.call('/api/business', { token });
    expect(await res.json()).toEqual({ business: null });
  });

  it('is created, then updated, by PUT', async () => {
    const token = await newOwner();
    const first = await s.call('/api/business', { method: 'PUT', token, json: SHOP });
    expect(await first.json()).toEqual({ business: { ...SHOP, setupComplete: false } });

    await s.call('/api/business', { method: 'PUT', token, json: { ...SHOP, employeeCount: 3, setupComplete: true } });
    const res = await s.call('/api/business', { token });
    expect(await res.json()).toEqual({ business: { ...SHOP, employeeCount: 3, setupComplete: true } });
  });

  it('trims text and stores an empty city as null', async () => {
    const token = await newOwner();
    const res = await s.call('/api/business', { method: 'PUT', token, json: { ...SHOP, name: '  Sharma Kirana  ', city: '  ' } });
    expect(await res.json()).toMatchObject({ business: { name: 'Sharma Kirana', city: null } });
  });

  it.each([
    [{ ...SHOP, name: '' }, "Business name can't be empty."],
    [{ ...SHOP, type: 'casino' }, 'Pick a business type from the list.'],
    [{ ...SHOP, employeeCount: -1 }, "Number of employees can't be negative."],
    [{ ...SHOP, employeeCount: 2.5 }, 'Number of employees must be a whole number.'],
    [{ ...SHOP, name: 'x'.repeat(81) }, 'Business name is too long (at most 80 characters).'],
  ])('rejects %j with a readable message', async (json, message) => {
    const token = await newOwner();
    const res = await s.call('/api/business', { method: 'PUT', token, json });
    expect(res.status).toBe(400);
    expect(await errorOf(res)).toBe(message);
  });

  it('rejects a body that is not JSON', async () => {
    const token = await newOwner();
    const res = await s.call('/api/business', { method: 'PUT', token, body: 'not json', headers: { 'Content-Type': 'application/json' } });
    expect(res.status).toBe(400);
    expect(await errorOf(res)).toBe('The request was not valid JSON.');
  });

  it('needs a login', async () => {
    expect((await s.call('/api/business')).status).toBe(401);
    expect((await s.call('/api/business', { method: 'PUT', json: SHOP })).status).toBe(401);
  });
});

describe('payees', () => {
  it('cannot be added before the business is set up', async () => {
    const token = await newOwner();
    const res = await addPayee(token, { role: 'employee', name: 'Suresh Pawar' });
    expect(res.status).toBe(409);
    expect(await errorOf(res)).toBe('Set up your business first.');
  });

  it('are added, listed in order, updated and deleted', async () => {
    const token = await newOwner();
    await setUp(token);

    const a = await addPayee(token, { role: 'employee', name: 'Suresh Pawar', amount: 14000, day: 1, aliases: ['suresh.p@okaxis'] });
    expect(a.status).toBe(201);
    const suresh = ((await a.json()) as { payee: { id: string } }).payee;
    expect(suresh).toMatchObject({ role: 'employee', name: 'Suresh Pawar', amount: 14000, day: 1, aliases: ['suresh.p@okaxis'] });

    await addPayee(token, { role: 'landlord', name: 'Ramesh Gupta', amount: 28000, day: 5 });
    await addPayee(token, { role: 'supplier', name: 'Shree Ganesh Distributors' });

    const list = (await (await s.call('/api/payees', { token })).json()) as { payees: { name: string; amount: number | null }[] };
    expect(list.payees.map((p) => p.name)).toEqual(['Suresh Pawar', 'Ramesh Gupta', 'Shree Ganesh Distributors']);
    expect(list.payees[2]).toMatchObject({ amount: null, aliases: [] });

    const upd = await s.call(`/api/payees/${suresh.id}`, { method: 'PATCH', token, json: { amount: 15000 } });
    expect(await upd.json()).toMatchObject({ payee: { name: 'Suresh Pawar', amount: 15000, day: 1 } });

    const del = await s.call(`/api/payees/${suresh.id}`, { method: 'DELETE', token });
    expect(del.status).toBe(204);
    const after = (await (await s.call('/api/payees', { token })).json()) as { payees: unknown[] };
    expect(after.payees).toHaveLength(2);
  });

  it.each([
    [{ role: 'employee', name: 'X', day: 32 }, 'Day of the month must be between 1 and 31.'],
    [{ role: 'employee', name: 'X', day: 0 }, 'Day of the month must be between 1 and 31.'],
    [{ role: 'employee', name: 'X', amount: 0 }, 'Amount must be more than ₹0.'],
    [{ role: 'employee', name: 'X', amount: 99.5 }, 'Amount must be in whole rupees.'],
    [{ role: 'boss', name: 'X' }, 'Pick who this payee is (employee, landlord, supplier, loan or bill).'],
    [{ role: 'employee', name: '   ' }, "Name can't be empty."],
    [{ role: 'employee', name: 'X', aliases: ['a', 'b', 'c', 'd', 'e', 'f'] }, 'At most 5 other names per payee.'],
  ])('rejects %j with a readable message', async (json, message) => {
    const token = await newOwner();
    await setUp(token);
    const res = await addPayee(token, json);
    expect(res.status).toBe(400);
    expect(await errorOf(res)).toBe(message);
  });

  it('an unknown id is 404', async () => {
    const token = await newOwner();
    await setUp(token);
    const res = await s.call('/api/payees/does-not-exist', { method: 'PATCH', token, json: { amount: 5 } });
    expect(res.status).toBe(404);
  });
});

describe('one owner cannot touch another owner’s data', () => {
  it('lists, updates and deletes only their own payees', async () => {
    const asha = await newOwner();
    const ravi = await newOwner();
    await setUp(asha);
    await setUp(ravi);
    const res = await addPayee(asha, { role: 'employee', name: 'Asha’s employee', amount: 12000 });
    const { id } = ((await res.json()) as { payee: { id: string } }).payee;

    const raviList = (await (await s.call('/api/payees', { token: ravi })).json()) as { payees: unknown[] };
    expect(raviList.payees).toEqual([]);

    expect((await s.call(`/api/payees/${id}`, { method: 'PATCH', token: ravi, json: { amount: 1 } })).status).toBe(404);
    expect((await s.call(`/api/payees/${id}`, { method: 'DELETE', token: ravi })).status).toBe(404);

    const ashaList = (await (await s.call('/api/payees', { token: asha })).json()) as { payees: { amount: number }[] };
    expect(ashaList.payees).toEqual([expect.objectContaining({ amount: 12000 })]);
  });

  it('each owner has a separate business profile', async () => {
    const a = await newOwner();
    const b = await newOwner();
    await s.call('/api/business', { method: 'PUT', token: a, json: { ...SHOP, name: 'Shop A' } });
    await s.call('/api/business', { method: 'PUT', token: b, json: { ...SHOP, name: 'Shop B' } });
    const res = await s.call('/api/business', { token: a });
    expect(await res.json()).toMatchObject({ business: { name: 'Shop A' } });
  });
});
