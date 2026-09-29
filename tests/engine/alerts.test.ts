import { describe, expect, it } from 'vitest';
import { buildAlerts, type AlertInput } from '../../src/engine/alerts';
import type { ForecastMonth, MonthSummary, Recurring } from '../../src/engine/types';
import { monthOf } from '../../src/engine/months';
import { raw, txns } from '../helpers';

const APR = monthOf('2026-04-01');
const month = (offset: number, sales = 100000, partial = false): MonthSummary => ({
  month: APR + offset,
  inflow: sales,
  outflow: 0,
  byCategory: { sales },
  count: 1,
  endBalance: null,
  partial,
});
const fc = (offset: number, inflow: number, outflow: number, endBalance: number | null = null, dueQuarterly: Recurring[] = []): ForecastMonth => ({
  month: APR + offset,
  inflow,
  outflow,
  net: inflow - outflow,
  byCategory: {},
  endBalance,
  dueQuarterly,
});

function input(p: Partial<AlertInput>): AlertInput {
  const months = p.months ?? [0, 1, 2, 3, 4, 5].map((i) => month(i));
  return {
    months,
    basis: months.filter((m) => !m.partial),
    forecast: [fc(6, 100, 50), fc(7, 100, 50), fc(8, 100, 50)],
    recurring: [],
    budget: [],
    budgetMonth: APR + 5,
    txns: [],
    fixedMonthly: 0,
    currentBalance: null,
    ...p,
  };
}

const titles = (p: Partial<AlertInput>) => buildAlerts(input(p)).map((a) => `${a.level}: ${a.title}`);

describe('buildAlerts', () => {
  it('is quiet when nothing is unusual', () => {
    expect(buildAlerts(input({}))).toEqual([]);
  });

  it('warns about a forecast shortfall and names the quarterly payment due', () => {
    const tax = { payee: 'Advance tax', amount: 24000 } as Recurring;
    const a = buildAlerts(input({ forecast: [fc(6, 100000, 90000), fc(7, 100000, 90000), fc(8, 100000, 130000, null, [tax])] }));
    expect(a[0]).toEqual({
      level: 'critical',
      title: 'Dec 2026: expected shortfall of ₹30,000',
      body: 'Likely outflow ₹1,30,000 against inflow ₹1,00,000. Advance tax (₹24,000, quarterly) falls due this month. Hold back stock purchases or collect dues early.',
    });
  });

  it('warns when the projected balance drops below one month of fixed costs', () => {
    const t = titles({ currentBalance: 50000, fixedMonthly: 60000, forecast: [fc(6, 1, 0, 70000), fc(7, 1, 0, 40000), fc(8, 1, 0, 45000)] });
    expect(t).toContain('warning: Balance may drop below one month of fixed costs');
  });

  it('reports a sales trend over 6 months', () => {
    const down = [100, 100, 100, 80, 80, 80].map((s, i) => month(i, s * 1000));
    expect(titles({ months: down })).toContain('warning: Sales down 20% in the last 3 months');
    const up = [80, 80, 80, 100, 100, 100].map((s, i) => month(i, s * 1000));
    expect(titles({ months: up })).toContain('good: Sales up 25% in the last 3 months');
  });

  it('does not divide by zero when early sales are 0', () => {
    const m = [0, 0, 0, 100, 100, 100].map((s, i) => month(i, s));
    expect(() => buildAlerts(input({ months: m }))).not.toThrow();
  });

  it('announces a new monthly payment and does not double-report its budget overrun', () => {
    const emi = { payee: 'Bajaj Finance', category: 'emi', frequency: 'monthly', amount: 18500, perMonth: 18500, since: APR + 3 } as Recurring;
    const budget = [{ id: 'emi', name: 'EMI & loans', limit: 500, actual: 18500, average: 0, total: 1, status: 'over', trend: [] as number[] } as const];
    const t = titles({ recurring: [emi], budget: [...budget] });
    expect(t).toContain('warning: New monthly payment: Bajaj Finance');
    expect(t.some((x) => x.includes('EMI & loans over'))).toBe(false);
  });

  it('notes personal payments and bank charges', () => {
    const t = txns([raw('2026-04-03', 'UPI/DR/1/ZOMATO/x@y/Order', -500), raw('2026-04-28', 'CHRG:QR RENTAL', -354)]);
    expect(titles({ txns: t })).toEqual(['info: 1 personal payment from this account', 'info: Bank charges: ₹354']);
  });

  it('explains partial months', () => {
    const months = [month(0, 1, true), month(1), month(2), month(3, 1, true)];
    const t = txns([raw('2026-04-20', 'UPI/CR/1', 1), raw('2026-07-12', 'UPI/CR/1', 1)]);
    const a = buildAlerts(input({ months, txns: t }));
    expect(a.map((x) => x.title)).toContain('Apr 2026 and Jul 2026 only partly covered');
    expect(a.find((x) => x.title.includes('partly'))!.body).toBe(
      'The statement starts on 20 Apr 2026 and ends on 12 Jul 2026, so these months are left out of the averages, budget and forecast.',
    );
  });

  it('says when there is too little history', () => {
    expect(titles({ months: [month(0)] })).toContain('info: Only 1 full month of history');
    expect(titles({ months: [month(0), month(1)] })).toContain('info: Only 2 full months of history');
  });
});
