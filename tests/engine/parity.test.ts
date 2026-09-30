/* The TypeScript engine must behave like prototype/engine.js. Known, intended differences:
   - category id `otherinc` is `other_income` (CLAUDE.md);
   - narrations with no payee get a shared "Unnamed …" payee instead of the raw narration text;
   - month labels are always "Sep" (Node's en-IN locale prints "Sept");
   - singular wording for one item ("1 personal payment", "1 charge");
   - rules added after the prototype (`added: true`) are switched off here and tested in rules.test.ts;
   - a payment-type word before a name is not part of the payee ("SALARY MANOJ" -> "Manoj", D18);
     the prototype's payee names are normalised the same way below, so grouping and amounts still must match. */
import { describe, expect, it } from 'vitest';
import { sampleStatementRows } from '../../src/engine/sample';
import { parseCSV, rowsToTxns } from '../../src/engine/parse';
import { enrich } from '../../src/engine/categorize';
import { RULES } from '../../src/engine/rules';
import { analyze } from '../../src/engine/analyze';
import type { Analysis, Txn } from '../../src/engine/types';
import { SYNTHETIC, loadPrototype, readText } from '../helpers';

const G = loadPrototype();
const PROTOTYPE_RULES = RULES.filter((r) => !r.added);
const cat = (c: string) => (c === 'otherinc' ? 'other_income' : c);
/** "Salary Manoj" -> "Manoj": the one intended payee-name difference (D18). */
const TYPE_WORDS = 'Salary|Sal|Wages|Rent|Shop|EMI|Loan';
const MONTH_WORDS = 'Jan|Feb|Mar|Apr|May|June?|July?|Aug|Sept?|Oct|Nov|Dec|January|February|March|April|August|September|October|November|December';
const payee = (p: string) =>
  // Only when a real name follows: "Rent Shop" and "Rent Shop April" stay as they are, like the engine.
  p.replace(new RegExp(`^(?:(?:${TYPE_WORDS}) )+(?=(?!(?:${TYPE_WORDS}|${MONTH_WORDS})\\b)[A-Z][a-z])`), '');
const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const text = (s: string) => s.replace(/Sept/g, 'Sep').replace(/^1 personal payments/, '1 personal payment').replace(/^1 charges/, '1 charge');

function compare(rows: unknown[][], opts: { comparePayees: (t: Txn) => boolean }) {
  const pTx = G.enrich(G.rowsToTxns(rows), {});
  const pA = G.analyze(pTx);
  const tx = enrich(rowsToTxns(rows as never), {}, undefined, PROTOTYPE_RULES);
  const a: Analysis = analyze(tx, { horizon: 3 }); // the prototype forecast 3 months; the app now shows 1 (D19)

  it('parses and categorizes every row the same way', () => {
    expect(tx).toHaveLength(pTx.length);
    tx.forEach((t, i) => {
      const p = pTx[i];
      expect([t.date, t.narration, t.withdrawal, t.deposit, t.balance, t.rail, t.category]).toEqual([
        iso(p.date),
        p.narr,
        p.debit,
        p.credit,
        p.bal,
        p.rail,
        cat(p.cat),
      ]);
      if (opts.comparePayees(t)) expect(t.payee).toBe(payee(p.payee));
    });
  });

  it('finds the same recurring payments', () => {
    const mine = a.recurring.map((r) => [r.payee, r.category, r.frequency, r.amount, r.day, r.count, r.frequency === 'monthly' ? r.perMonth : r.next]);
    const theirs = pA.recurring.map((r: any) => [payee(r.payee), cat(r.cat), r.freq.toLowerCase(), r.amount, r.day, r.count, r.freq === 'Monthly' ? r.perMonth : r.next]);
    expect(mine).toEqual(theirs);
  });

  it('forecasts the same numbers', () => {
    expect(a.forecast.map((f) => f.month)).toEqual(pA.forecast.map((f: any) => f.m));
    a.forecast.forEach((f, i) => {
      const p = pA.forecast[i];
      expect(f.inflow).toBeCloseTo(p.in, 6);
      expect(f.outflow).toBeCloseTo(p.out, 6);
      if (p.endBal === null) expect(f.endBalance).toBeNull();
      else expect(f.endBalance!).toBeCloseTo(p.endBal, 6);
    });
  });

  it('has the same balance, averages, budget and alerts', () => {
    expect(a.currentBalance).toBe(pA.curBal);
    expect(a.fixedMonthly).toBe(pA.fixedMonthly);
    expect(a.avgInflow).toBeCloseTo(pA.avgIn, 6);
    expect(a.avgOutflow).toBeCloseTo(pA.avgOut, 6);
    expect(a.budget.map((b) => [b.id, b.limit, b.actual, b.status])).toEqual(pA.budget.map((b: any) => [cat(b.id), b.limit, b.actual, b.status]));
    expect(a.alerts.map((x) => [x.level, x.title, x.body])).toEqual(pA.alerts.map((x: any) => [x.level, text(x.title), text(x.body)]));
  });
}

describe('parity with the prototype: built-in sample statement', () => {
  it('generates the identical sample rows', () => {
    expect(sampleStatementRows()).toEqual(G.sampleRows());
  });
  compare(G.sampleRows(), { comparePayees: () => true });
});

describe('parity with the prototype: synthetic HDFC kirana CSV', () => {
  // The prototype names payee-less credits after their raw narration; the port uses "Unnamed …".
  compare(parseCSV(readText(SYNTHETIC)), { comparePayees: (t) => !t.payee.startsWith('Unnamed') });
});
