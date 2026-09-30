import { describe, expect, it } from 'vitest';
import { draftToInput, newDraft, parseRupees, planPayees, toDraft, type PayeeDraft } from '../../src/api/payeeDraft';
import type { PayeeRule } from '../../src/engine/profile';

const saved = (over: Partial<PayeeRule>): PayeeRule => ({ id: 'p1', role: 'employee', name: 'Suresh', amount: 14000, day: 1, aliases: [], ...over });
const draft = (over: Partial<PayeeDraft>): PayeeDraft => ({ ...newDraft('employee'), ...over });

describe('parseRupees', () => {
  it.each([
    ['14000', 14000],
    ['14,000', 14000],
    ['₹ 1,23,456', 123456],
    ['Rs. 500', 500],
    ['999.50', 1000],
    ['', null],
    ['  ', null],
  ])('%j -> %j', (s, n) => expect(parseRupees(s)).toBe(n));

  it.each(['abc', '-500', '0', '12.345', '1e5', '99999999999'])('%j is invalid', (s) => expect(parseRupees(s)).toBe('invalid'));
});

describe('draftToInput', () => {
  it('ignores a completely blank row', () => {
    expect(draftToInput(draft({}))).toBeNull();
  });

  it('builds a payload with trimmed text', () => {
    expect(draftToInput(draft({ name: '  Suresh Pawar ', amount: '14,000', day: '1', alias: ' suresh@okaxis ' }))).toEqual({
      input: { role: 'employee', name: 'Suresh Pawar', amount: 14000, day: 1, aliases: ['suresh@okaxis'] },
    });
  });

  it('allows a name with no amount or day', () => {
    expect(draftToInput(draft({ name: 'Shree Ganesh', role: 'supplier' }))).toEqual({
      input: { role: 'supplier', name: 'Shree Ganesh', amount: null, day: null, aliases: [] },
    });
  });

  it.each([
    [{ amount: '5000' }, 'Add a name, or clear this row.'],
    [{ name: 'X', amount: 'lots' }, 'Amount should be in rupees, like 14000.'],
    [{ name: 'X', day: '32' }, 'Day should be a date of the month, 1 to 31.'],
    [{ name: 'X', day: '1.5' }, 'Day should be a date of the month, 1 to 31.'],
  ])('%j -> %s', (over, error) => expect(draftToInput(draft(over))).toEqual({ error }));
});

describe('planPayees', () => {
  it('creates new rows, skips blank ones', () => {
    const plan = planPayees([], [draft({ name: 'A' }), draft({}), draft({ name: 'B', amount: '9000' })], ['employee']);
    expect(plan.create.map((p) => p.name)).toEqual(['A', 'B']);
    expect(plan).toMatchObject({ update: [], remove: [], errors: {} });
  });

  it('sends nothing for an unchanged saved row', () => {
    const p = saved({});
    expect(planPayees([p], [toDraft(p)], ['employee'])).toEqual({ create: [], update: [], remove: [], errors: {} });
  });

  it('updates a changed saved row', () => {
    const p = saved({});
    const plan = planPayees([p], [{ ...toDraft(p), amount: '15000' }], ['employee']);
    expect(plan.update).toEqual([{ id: 'p1', input: expect.objectContaining({ amount: 15000 }) }]);
  });

  it('deletes a saved row that was removed or cleared', () => {
    const a = saved({ id: 'a' });
    const b = saved({ id: 'b', name: 'Anita' });
    const plan = planPayees([a, b], [{ ...toDraft(b), name: '', amount: '', day: '' }], ['employee']);
    expect(plan.remove.sort()).toEqual(['a', 'b']);
  });

  it('leaves payees of other roles alone', () => {
    const landlord = saved({ id: 'l', role: 'landlord', name: 'Ramesh' });
    expect(planPayees([landlord], [], ['employee', 'supplier']).remove).toEqual([]);
  });

  it('reports errors per row key', () => {
    const bad = draft({ name: 'X', day: '40' });
    expect(planPayees([], [bad], ['employee']).errors).toEqual({ [bad.key]: 'Day should be a date of the month, 1 to 31.' });
  });
});
