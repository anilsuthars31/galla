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

describe('bill payments (bug report 2026-09-30)', () => {
  // The model was 66% sure these were utilities, so every one landed in "needs review".
  const unsure = fakeModel([
    { category: 'utilities', probability: 0.66 },
    { category: 'tax', probability: 0.14 },
  ]);

  it('BILL/INTERNET rows are sorted by the rule, not left for review', () => {
    const [a, b] = enrich(
      [raw('2026-09-18', 'BILL/INTERNET/name@okaxis', -1499), raw('2026-09-20', 'BILL/ELECTRICITY/MSEDCL', -2100)],
      {},
      unsure,
    );
    expect(a).toMatchObject({ payee: 'Internet bill', category: 'utilities', source: 'rule' });
    expect(b).toMatchObject({ payee: 'Electricity bill', category: 'utilities', source: 'rule' });
    expect(a!.key).not.toBe(b!.key);
  });

  it('correcting one bill does not move the other', () => {
    const rows = [raw('2026-09-18', 'BILL/INTERNET/x@okaxis', -1499), raw('2026-09-20', 'BILL/ELECTRICITY/MSEDCL', -2100)];
    const [net] = enrich(rows, {}, unsure);
    const [a, b] = enrich(rows, { [net!.key]: 'other' }, unsure);
    expect(a!.category).toBe('other');
    expect(b!.category).toBe('utilities');
  });
});

describe('setup payees (profile)', () => {
  const landlord = { id: 'l1', role: 'landlord' as const, name: 'Sharma Enterprises', amount: 28000, day: 5, aliases: [] };
  const staff = { id: 'e1', role: 'employee' as const, name: 'Rajesh Kumar', amount: 12000, day: 1, aliases: [] };

  it('beats a keyword rule: the owner said this "enterprise" is the landlord', () => {
    const row = raw('2026-09-05', 'NEFT DR-SHARMA ENTERPRISES-N123', -28000);
    expect(enrich([row])[0]).toMatchObject({ category: 'suppliers', source: 'rule' });
    expect(enrich([row], {}, undefined, undefined, [landlord])[0]).toMatchObject({ category: 'rent', source: 'profile', payee: 'Sharma Enterprises' });
  });

  it('sorts a payment with no keyword that would otherwise need review', () => {
    const row = raw('2026-09-01', 'UPI/DR/412/RAJESH KUMAR/YESB', -12000);
    expect(enrich([row])[0]!.source).toBe('review');
    expect(enrich([row], {}, undefined, undefined, [staff])[0]).toMatchObject({ category: 'salary', source: 'profile' });
  });

  it('an owner correction still wins', () => {
    const row = raw('2026-09-01', 'UPI/DR/412/RAJESH KUMAR/YESB', -500);
    const [t] = enrich([row], {}, undefined, undefined, [staff]);
    const [u] = enrich([row], { [t!.key]: 'personal' }, undefined, undefined, [staff]);
    expect(u).toMatchObject({ category: 'personal', source: 'owner' });
  });

  it('money coming in from the same person is not treated as salary', () => {
    const [t] = enrich([raw('2026-09-03', 'UPI/CR/88/RAJESH KUMAR/Payment', 750)], {}, undefined, undefined, [staff]);
    expect(t).toMatchObject({ dir: 'C', source: 'rule', category: 'sales' });
  });

  it('spelling variants of one person become one payee', () => {
    const txns = enrich(
      [raw('2026-08-01', 'SALARY/RAJESH K/UPI', -12000), raw('2026-09-01', 'SALARY/RAJESHK/UPI', -12000)],
      {},
      undefined,
      undefined,
      [staff],
    );
    expect(new Set(txns.map((t) => t.key)).size).toBe(1);
    expect(txns.every((t) => t.payee === 'Rajesh Kumar')).toBe(true);
  });
});
