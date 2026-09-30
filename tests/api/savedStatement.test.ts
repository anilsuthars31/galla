import { describe, expect, it } from 'vitest';
import { parseSavedStatement } from '../../src/ui/savedStatement';

const txn = { date: '2026-09-18', narration: 'BILL/INTERNET', withdrawal: 1499, deposit: 0, balance: 52000, order: 0 };

describe('parseSavedStatement', () => {
  it('accepts a statement saved by the app', () => {
    const s = { name: 'hdfc.xlsx', raw: [txn, { ...txn, order: 1, balance: null }] };
    expect(parseSavedStatement(s)).toEqual(s);
  });

  it.each([
    ['nothing saved', null],
    ['not an object', 'hdfc.xlsx'],
    ['no rows', { name: 'x', raw: [] }],
    ['missing name', { raw: [txn] }],
    ['bad date', { name: 'x', raw: [{ ...txn, date: '18/09/2026' }] }],
    ['negative amount', { name: 'x', raw: [{ ...txn, withdrawal: -5 }] }],
    ['amount as text', { name: 'x', raw: [{ ...txn, deposit: '100' }] }],
    ['one bad row among good ones', { name: 'x', raw: [txn, { ...txn, narration: 5 }] }],
  ])('ignores %s', (_label, v) => {
    expect(parseSavedStatement(v)).toBeNull();
  });
});
