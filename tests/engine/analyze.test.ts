import { describe, expect, it } from 'vitest';
import { analyze, summarizeMonths } from '../../src/engine/analyze';
import { processRows, processStatement } from '../../src/engine';
import { sampleStatementRows } from '../../src/engine/sample';
import { parseStatementText } from '../../src/engine/parse';
import { monthLabel, monthOf } from '../../src/engine/months';
import type { RawTxn } from '../../src/engine/types';
import { SYNTHETIC, monthly, raw, readText, txns } from '../helpers';

/** A simple shop: daily sales, rent on the 5th, supplier on the 10th, over [from, to] inclusive. */
function shop(from: string, to: string, withBalance = true): RawTxn[] {
  const rows: RawTxn[] = [];
  let bal = 100000;
  const d = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  for (; d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const iso = d.toISOString().slice(0, 10);
    const add = (n: string, amt: number) => {
      bal += amt;
      rows.push(raw(iso, n, amt, withBalance ? bal : null));
    };
    add('UPI SETTLEMENT 1', 5000);
    if (d.getUTCDate() === 5) add('IMPS/P2A/1/RAMESH GUPTA/SBIN0011234/Shop rent', -28000);
    if (d.getUTCDate() === 10) add('NEFT DR-SHREE GANESH DISTRIBUTORS', -60000);
  }
  return rows;
}

describe('analyze: built-in sample statement', () => {
  const { txns: t, analysis: a } = processRows(sampleStatementRows());

  it('covers April to September 2026 with full months', () => {
    expect(a.months.map((m) => monthLabel(m.month))).toEqual(['Apr 2026', 'May 2026', 'Jun 2026', 'Jul 2026', 'Aug 2026', 'Sep 2026']);
    expect(a.months.every((m) => !m.partial)).toBe(true);
    expect(a.basisMonths).toHaveLength(6);
    expect(a.period).toEqual({ from: '2026-04-01', to: '2026-09-30' });
  });

  it('month totals add up to the transactions', () => {
    const inflow = t.filter((x) => x.dir === 'C').reduce((s, x) => s + x.amount, 0);
    expect(a.months.reduce((s, m) => s + m.inflow, 0)).toBeCloseTo(inflow, 6);
    for (const m of a.months) {
      const byCat = Object.values(m.byCategory).reduce((s, v) => s + (v ?? 0), 0);
      expect(byCat).toBeCloseTo(m.inflow + m.outflow, 6);
    }
  });

  it('the balance at the end is the last closing balance', () => {
    const last = t[t.length - 1]!;
    expect(a.currentBalance).toBe(last.balance);
    expect(a.months[a.months.length - 1]!.endBalance).toBe(last.balance);
  });

  it('finds the known fixed payments', () => {
    const r = Object.fromEntries(a.recurring.map((x) => [x.payee, x]));
    expect(r['Ramesh Gupta']).toMatchObject({ category: 'rent', frequency: 'monthly', amount: 28000 });
    expect(r['Bajaj Finance']).toMatchObject({ category: 'emi', frequency: 'monthly', amount: 18500, since: monthOf('2026-07-01') });
    expect(r['Advance tax']).toMatchObject({ category: 'tax', frequency: 'quarterly', amount: 24000, next: monthOf('2026-12-01') });
    expect(r['Airtel']).toMatchObject({ category: 'utilities', amount: 999 });
    expect(r['Netflix']).toMatchObject({ category: 'personal', amount: 649 });
  });

  it('forecasts October to December, with advance tax in December', () => {
    expect(a.forecast.map((f) => monthLabel(f.month))).toEqual(['Oct 2026', 'Nov 2026', 'Dec 2026']);
    expect(a.forecast[2]!.dueQuarterly.map((r) => r.payee)).toEqual(['Advance tax']);
  });

  it('raises the new EMI and the personal-spending note', () => {
    const titles = a.alerts.map((x) => x.title);
    expect(titles).toContain('New monthly payment: Bajaj Finance');
    expect(titles.some((x) => /personal payments from this account/.test(x))).toBe(true);
  });

  it('is deterministic', () => {
    expect(processRows(sampleStatementRows())).toEqual(processRows(sampleStatementRows()));
  });
});

describe('analyze: synthetic HDFC kirana CSV', () => {
  const { txns: t, analysis: a } = processStatement(parseStatementText(readText(SYNTHETIC)));

  it('reads 6 months with the right closing balance', () => {
    expect(t).toHaveLength(608);
    expect(a.months.map((m) => monthLabel(m.month))).toEqual(['Apr 2026', 'May 2026', 'Jun 2026', 'Jul 2026', 'Aug 2026', 'Sep 2026']);
    expect(a.currentBalance).toBe(1445453.52);
  });

  it('finds the monthly salary, electricity and internet payments', () => {
    const monthlyPayees = a.recurring.filter((r) => r.frequency === 'monthly').map((r) => r.payee);
    expect(monthlyPayees).toEqual(expect.arrayContaining(['Manoj', 'Bescom Electricity', 'Act Fibernet']));
  });

  it('treats the same payee as a customer or a payee depending on direction (hard case)', () => {
    const ramesh = t.filter((x) => x.payee === 'ramesh');
    expect(new Set(ramesh.map((x) => x.key))).toEqual(new Set(['ramesh:C', 'ramesh:D']));
    expect(ramesh.filter((x) => x.dir === 'C').every((x) => x.category === 'sales')).toBe(true);
  });

  it('groups payee-less credits under one payee', () => {
    const unnamed = t.filter((x) => x.narration.startsWith('UPI/CR'));
    expect(new Set(unnamed.map((x) => x.payee))).toEqual(new Set(['Unnamed UPI payment']));
  });
});

describe('analyze: edge cases', () => {
  it('leaves partial first and last months out of averages, budget and forecast', () => {
    const a = analyze(txns(shop('2026-04-20', '2026-08-10')));
    expect(a.months.map((m) => [monthLabel(m.month), m.partial])).toEqual([
      ['Apr 2026', true],
      ['May 2026', false],
      ['Jun 2026', false],
      ['Jul 2026', false],
      ['Aug 2026', true],
    ]);
    expect(a.basisMonths).toEqual([monthOf('2026-05-01'), monthOf('2026-06-01'), monthOf('2026-07-01')]);
    expect(a.budgetMonth).toBe(monthOf('2026-07-01'));
    // Averages use full months only: May (31 days) June (30) July (31) of ₹5,000 a day.
    expect(a.avgInflow).toBeCloseTo((31 + 30 + 31) * 5000 / 3, 6);
    expect(a.forecast[0]!.month).toBe(monthOf('2026-09-01'));
    expect(a.forecast[0]!.byCategory.sales).toBeCloseTo(a.avgInflow, 6);
    expect(a.alerts.map((x) => x.title)).toContain('Apr 2026 and Aug 2026 only partly covered');
  });

  it('a nearly full month is not partial', () => {
    const a = analyze(txns(shop('2026-04-02', '2026-06-28')));
    expect(a.months.every((m) => !m.partial)).toBe(true);
  });

  it('uses all months when none is full', () => {
    const a = analyze(txns(shop('2026-04-10', '2026-04-15')));
    expect(a.basisMonths).toEqual([monthOf('2026-04-01')]);
    expect(a.forecast).toHaveLength(3);
  });

  it('works with 1 month of history', () => {
    const a = analyze(txns(shop('2026-04-01', '2026-04-30')));
    expect(a.months).toHaveLength(1);
    expect(a.recurring).toEqual([]);
    expect(a.forecast.map((f) => f.inflow)).toEqual([150000, 150000, 150000]);
    expect(a.alerts.map((x) => x.title)).toContain('Only 1 full month of history');
  });

  it('works with 2 months of history', () => {
    const a = analyze(txns(shop('2026-04-01', '2026-05-31')));
    expect(a.months).toHaveLength(2);
    expect(a.forecast).toHaveLength(3);
    expect(a.budget.length).toBeGreaterThan(0);
    expect(a.alerts.map((x) => x.title)).toContain('Only 2 full months of history');
  });

  it('works without a balance column', () => {
    const a = analyze(txns(shop('2026-04-01', '2026-09-30', false)));
    expect(a.currentBalance).toBeNull();
    expect(a.hasBalance).toBe(false);
    expect(a.months.every((m) => m.endBalance === null)).toBe(true);
    expect(a.forecast.every((f) => f.endBalance === null)).toBe(true);
    expect(a.alerts.some((x) => x.title.includes('Balance may drop'))).toBe(false);
  });

  it('includes a month with no transactions as zero', () => {
    const t = txns([...monthly('UPI SETTLEMENT', 1000, 1, [4]), ...monthly('UPI SETTLEMENT', 1000, 28, [6])]);
    const s = summarizeMonths(t);
    expect(s.map((m) => [monthLabel(m.month), m.inflow, m.count])).toEqual([
      ['Apr 2026', 1000, 1],
      ['May 2026', 0, 0],
      ['Jun 2026', 1000, 1],
    ]);
  });

  it('a single transaction does not break anything', () => {
    const a = analyze(txns([raw('2026-04-15', 'UPI/CR/1', 500, 500)]));
    expect(a.months).toHaveLength(1);
    expect(a.forecast[0]!.inflow).toBe(500);
  });

  it('throws the owner-friendly message for no transactions', () => {
    expect(() => analyze([])).toThrow(/no transactions with a valid date/);
  });

  it('handles 6,000+ rows end to end in well under 2 seconds', () => {
    const rows = shop('2025-10-01', '2026-09-30').flatMap((r, i) => [
      r,
      ...Array.from({ length: 12 }, (_, j) => raw(r.date, `UPI/CR/${i}${j}/CUSTOMER ${(i + j) % 40}/x@ybl/Payment`, 100 + ((i * j) % 500))),
      raw(r.date, `UPI/DR/${i}/AGARWAL TRADERS/x@okhdfcbank/Stock`, -(1000 + (i % 900))),
      raw(r.date, `UPI/CR/${i}`, 50 + (i % 70)),
    ]);
    expect(rows.length).toBeGreaterThan(5000);
    const start = performance.now();
    const { analysis } = processStatement(rows);
    expect(performance.now() - start).toBeLessThan(2000);
    expect(analysis.months).toHaveLength(12);
  });
});
