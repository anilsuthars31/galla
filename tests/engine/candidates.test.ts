import { describe, expect, it } from 'vitest';
import { payeeCandidates } from '../../src/engine/candidates';
import type { Classifier } from '../../src/engine/types';
import { raw, txns } from '../helpers';
import { enrich } from '../../src/engine/categorize';

const months = (narration: string, amount: number, ms: number[], day = 5) =>
  ms.map((m) => raw(`2026-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`, narration, -amount));

describe('payeeCandidates', () => {
  it('asks about a payee paid in 2+ months that nothing could sort', () => {
    const [c] = payeeCandidates(txns(months('UPI/DR/1/SURESH PAWAR/YESB', 14000, [7, 8, 9], 1)));
    expect(c).toMatchObject({ payee: 'Suresh Pawar', count: 3, months: 3, amount: 14000, day: 1, category: 'other', source: 'review' });
  });

  it('skips payees seen in only one month', () => {
    expect(payeeCandidates(txns(months('UPI/DR/1/SURESH PAWAR/YESB', 14000, [7])))).toEqual([]);
  });

  it('skips payees already sorted by a keyword rule, the owner or setup', () => {
    const rows = [...months('SALARY/RAJESH K/UPI', 12000, [7, 8]), ...months('UPI/DR/1/ANITA KAMBLE/SBI', 9000, [7, 8])];
    const t = txns(rows);
    expect(payeeCandidates(t).map((c) => c.payee)).toEqual(['Anita Kamble']);
    const anita = t.find((x) => x.payee === 'Anita Kamble')!;
    const owned = enrich(rows, { [anita.key]: 'salary' });
    expect(payeeCandidates(owned)).toEqual([]);
    const setup = enrich(rows, {}, undefined, undefined, [{ id: 'a', role: 'employee', name: 'Anita Kamble', amount: 9000, day: 5, aliases: [] }]);
    expect(payeeCandidates(setup)).toEqual([]);
  });

  it('includes model guesses (the owner can confirm them), after rows needing review', () => {
    const model: Classifier = { predict: () => [{ category: 'suppliers', probability: 0.9 }] };
    const rows = [...months('NEFT/BALAJI FMCG/1', 20000, [7, 8]), ...months('UPI/DR/1/SURESH PAWAR/YESB', 14000, [7, 8])];
    const unsure: Classifier = { predict: (i) => (i.narration.includes('SURESH') ? [{ category: 'salary', probability: 0.5 }] : model.predict(i)) };
    const list = payeeCandidates(enrich(rows, {}, unsure));
    expect(list.map((c) => [c.payee, c.source])).toEqual([
      ['Suresh Pawar', 'review'],
      ['Balaji Fmcg', 'model'],
    ]);
  });

  it('never asks about money coming in, bank charges, ATM cash or unnamed payments', () => {
    const rows = [
      ...[7, 8].map((m) => raw(`2026-0${m}-03`, 'UPI/CR/1/CUSTOMER RAVI/Payment', 500)),
      ...months('UPI/DR/771201', 800, [7, 8]),
      ...months('ATM WDL/ATM SBI KOTHRUD', 5000, [7, 8]),
    ];
    expect(payeeCandidates(txns(rows))).toEqual([]);
  });

  it('orders by money involved and stops at the limit', () => {
    const rows = [
      ...months('UPI/DR/1/SMALL PAYEE/SBI', 100, [7, 8]),
      ...months('UPI/DR/1/BIG PAYEE/SBI', 50000, [7, 8]),
      ...months('UPI/DR/1/MIDDLE PAYEE/SBI', 5000, [7, 8]),
    ];
    expect(payeeCandidates(txns(rows)).map((c) => c.payee)).toEqual(['Big Payee', 'Middle Payee', 'Small Payee']);
    expect(payeeCandidates(txns(rows), 2)).toHaveLength(2);
  });

  it('typical amount and day are medians (one odd payment does not skew them)', () => {
    const rows = [
      raw('2026-07-01', 'UPI/DR/1/SURESH PAWAR/YESB', -14000),
      raw('2026-08-02', 'UPI/DR/1/SURESH PAWAR/YESB', -14000),
      raw('2026-09-20', 'UPI/DR/1/SURESH PAWAR/YESB', -500),
    ];
    expect(payeeCandidates(txns(rows))[0]).toMatchObject({ amount: 14000, day: 2 });
  });
});
