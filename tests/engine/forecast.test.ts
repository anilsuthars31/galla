import { describe, expect, it } from 'vitest';
import { buildForecast, conservativeAverage, isDue } from '../../src/engine/forecast';
import type { MonthSummary, Recurring } from '../../src/engine/types';
import { monthOf } from '../../src/engine/months';

const APR = monthOf('2026-04-01');

function month(offset: number, byCategory: MonthSummary['byCategory']): MonthSummary {
  return { month: APR + offset, inflow: 0, outflow: 0, byCategory, count: 1, endBalance: null, partial: false };
}

function rec(p: Partial<Recurring>): Recurring {
  return {
    key: 'k',
    payee: 'P',
    category: 'rent',
    frequency: 'monthly',
    amount: 0,
    perMonth: 0,
    day: 1,
    count: 3,
    txnIds: [],
    since: APR,
    months: 3,
    next: APR + 6,
    ...p,
  };
}

describe('conservativeAverage', () => {
  it('takes the lower of the last-3 and whole-period averages', () => {
    expect(conservativeAverage([100, 100, 100, 70, 70, 70])).toBe(70); // falling: recent is lower
    expect(conservativeAverage([70, 70, 70, 100, 100, 100])).toBe(85); // rising: long-run is lower
  });

  it('handles 1-2 months', () => {
    expect(conservativeAverage([500])).toBe(500);
    expect(conservativeAverage([400, 600])).toBe(500);
    expect(conservativeAverage([])).toBe(0);
  });
});

describe('buildForecast', () => {
  const basis = [
    month(0, { sales: 100000, other_income: 0 }),
    month(1, { sales: 100000 }),
    month(2, { sales: 100000 }),
    month(3, { sales: 70000 }),
    month(4, { sales: 70000 }),
    month(5, { sales: 70000, other_income: 3000 }),
  ];
  const last = APR + 5; // Sep

  it('forecasts next month only by default (D19)', () => {
    const f = buildForecast({ basis, lastMonth: last, recurring: [], nonRecurring: {}, startBalance: null });
    expect(f.map((m) => m.month)).toEqual([last + 1]);
  });

  it('can still forecast more months on request', () => {
    const f = buildForecast({ basis, lastMonth: last, recurring: [], nonRecurring: {}, startBalance: null, horizon: 3 });
    expect(f.map((m) => m.month)).toEqual([last + 1, last + 2, last + 3]);
  });

  it('uses conservative income and the recent average of non-recurring spend', () => {
    const nonRecurring = { suppliers: { [APR + 3]: 30000, [APR + 4]: 36000, [APR + 5]: 33000, [APR]: 99999 } };
    const [oct] = buildForecast({ basis, lastMonth: last, recurring: [], nonRecurring, startBalance: null });
    expect(oct!.byCategory.sales).toBe(70000);
    expect(oct!.byCategory.other_income).toBe(500); // min(1000, 500)
    expect(oct!.byCategory.suppliers).toBe(33000); // average of the last 3 months only
    expect(oct!.inflow).toBe(70500);
    expect(oct!.outflow).toBe(33000);
    expect(oct!.net).toBe(37500);
  });

  it('adds monthly recurring payments every month and quarterly ones when due', () => {
    const recurring = [
      rec({ category: 'rent', frequency: 'monthly', perMonth: 28000, amount: 28000 }),
      rec({ category: 'tax', frequency: 'quarterly', amount: 24000, next: last + 3, payee: 'Advance tax' }),
    ];
    const f = buildForecast({ basis, lastMonth: last, recurring, nonRecurring: {}, startBalance: null, horizon: 3 });
    expect(f.map((m) => m.byCategory.rent)).toEqual([28000, 28000, 28000]);
    expect(f.map((m) => m.byCategory.tax)).toEqual([undefined, undefined, 24000]);
    expect(f[2]!.dueQuarterly.map((r) => r.payee)).toEqual(['Advance tax']);
  });

  it('chains the closing balance', () => {
    const f = buildForecast({ basis, lastMonth: last, recurring: [], nonRecurring: {}, startBalance: 10000, horizon: 3 });
    expect(f.map((m) => m.endBalance)).toEqual([80500, 151000, 221500]);
  });

  it('leaves the balance empty when the file has no balance column', () => {
    const f = buildForecast({ basis, lastMonth: last, recurring: [], nonRecurring: {}, startBalance: null });
    expect(f.every((m) => m.endBalance === null)).toBe(true);
  });

  it('works with a single month of history', () => {
    const f = buildForecast({ basis: [month(0, { sales: 50000 })], lastMonth: APR, recurring: [], nonRecurring: { other: { [APR]: 9000 } }, startBalance: 0 });
    expect(f[0]).toMatchObject({ inflow: 50000, outflow: 9000, endBalance: 41000 });
  });

  it('isDue only for quarterly items in their months', () => {
    const q = rec({ frequency: 'quarterly', next: 100 });
    expect([99, 100, 101, 102, 103, 106].map((m) => isDue(q, m))).toEqual([false, true, false, false, true, true]);
    expect(isDue(rec({ frequency: 'monthly', next: 100 }), 100)).toBe(false);
  });
});
