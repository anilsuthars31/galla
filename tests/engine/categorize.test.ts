import { describe, expect, it } from 'vitest';
import { MODEL_THRESHOLD, categorize, enrich } from '../../src/engine/categorize';
import type { CategorizeInput } from '../../src/engine/categorize';
import type { Classifier, ClassifierInput, Suggestion } from '../../src/engine/types';
import { raw } from '../helpers';

const input = (narration: string, dir: 'C' | 'D', key = 'payee:' + dir): CategorizeInput => ({
  narration,
  dir,
  amount: 1000,
  date: '2026-04-15',
  rail: 'UPI',
  key,
});

/** Fake model that always returns the same ranking and records what it saw. */
function fakeModel(ranking: Suggestion[]): Classifier & { seen: ClassifierInput[] } {
  const seen: ClassifierInput[] = [];
  return {
    seen,
    predict(i) {
      seen.push(i);
      return ranking;
    },
  };
}

describe('categorize order: owner > rule > model > review', () => {
  it('owner override beats a rule', () => {
    const c = categorize(input('SALARY RAJESH', 'D'), { 'payee:D': 'personal' });
    expect(c).toEqual({ category: 'personal', source: 'owner', confidence: 1, suggestions: [] });
  });

  it('ignores an override for the wrong direction', () => {
    expect(categorize(input('SALARY RAJESH', 'D'), { 'payee:D': 'sales' }).source).toBe('rule');
    expect(categorize(input('UPI/CR/1', 'C'), { 'payee:C': 'rent' }).category).toBe('sales');
  });

  it('rule beats the model', () => {
    const model = fakeModel([{ category: 'personal', probability: 0.99 }]);
    expect(categorize(input('SALARY RAJESH', 'D'), {}, model)).toMatchObject({ category: 'salary', source: 'rule', confidence: 1 });
    expect(model.seen).toHaveLength(0);
  });

  it('uses the model at or above 0.8', () => {
    expect(MODEL_THRESHOLD).toBe(0.8);
    const model = fakeModel([
      { category: 'suppliers', probability: 0.8 },
      { category: 'other', probability: 0.2 },
    ]);
    expect(categorize(input('UNKNOWN PAYEE', 'D'), {}, model)).toEqual({ category: 'suppliers', source: 'model', confidence: 0.8, suggestions: [] });
    expect(model.seen[0]).toEqual({ narration: 'UNKNOWN PAYEE', dir: 'D', amount: 1000, day: 15, rail: 'UPI' });
  });

  it('below 0.8 the row needs review, with the top 2 suggestions and the safe fallback', () => {
    const model = fakeModel([
      { category: 'suppliers', probability: 0.6 },
      { category: 'rent', probability: 0.3 },
      { category: 'other', probability: 0.1 },
    ]);
    expect(categorize(input('UNKNOWN PAYEE', 'D'), {}, model)).toEqual({
      category: 'other',
      source: 'review',
      confidence: 0,
      suggestions: [
        { category: 'suppliers', probability: 0.6 },
        { category: 'rent', probability: 0.3 },
      ],
    });
  });

  it('drops model suggestions for the wrong direction', () => {
    const model = fakeModel([
      { category: 'sales', probability: 0.9 },
      { category: 'rent', probability: 0.1 },
    ]);
    const c = categorize(input('UNKNOWN PAYEE', 'D'), {}, model);
    expect(c.source).toBe('review');
    expect(c.suggestions.map((s) => s.category)).toEqual(['rent']);
  });

  it('without a model, unknown rows need review with no suggestions', () => {
    expect(categorize(input('UNKNOWN PAYEE', 'D'))).toEqual({ category: 'other', source: 'review', confidence: 0, suggestions: [] });
    expect(categorize(input('VPA shop123@oksbi', 'C'))).toMatchObject({ category: 'sales', source: 'review' });
  });
});

describe('enrich', () => {
  const rows = [
    raw('2026-04-02', 'UPI/DR/1/AGARWAL TRADERS/x@okhdfcbank/Stock', -5000),
    raw('2026-04-01', 'UPI/CR/1/CUSTOMER ONE/x@ybl/Payment', 300),
    raw('2026-04-01', 'IMPS/P2A/1/RAMESH GUPTA/SBIN0011234/Shop rent', -28000),
    raw('2026-05-02', 'UPI/DR/2/AGARWAL TRADERS/x@okhdfcbank/Stock', -7000),
  ];

  it('sorts by date and keeps statement order within a day', () => {
    const t = enrich(rows);
    expect(t.map((x) => x.payee)).toEqual(['Customer One', 'Ramesh Gupta', 'Agarwal Traders', 'Agarwal Traders']);
    expect(t.map((x) => x.id)).toEqual([0, 1, 2, 3]);
  });

  it('adds direction, amount, rail, payee and key', () => {
    const t = enrich(rows)[2]!;
    expect(t).toMatchObject({ dir: 'D', amount: 5000, rail: 'UPI', payee: 'Agarwal Traders', key: 'agarwaltraders:D', category: 'suppliers', source: 'rule' });
  });

  it('an owner correction applies to every payment to that payee', () => {
    const t = enrich(rows, { 'agarwaltraders:D': 'other' });
    const agarwal = t.filter((x) => x.payee === 'Agarwal Traders');
    expect(agarwal).toHaveLength(2);
    expect(agarwal.every((x) => x.category === 'other' && x.source === 'owner')).toBe(true);
    expect(t.find((x) => x.payee === 'Ramesh Gupta')!.category).toBe('rent');
  });

  it('is deterministic and does not mutate its input', () => {
    const copy = structuredClone(rows);
    expect(enrich(rows)).toEqual(enrich(rows));
    expect(rows).toEqual(copy);
  });
});
