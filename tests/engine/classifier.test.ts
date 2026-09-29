import { describe, expect, it } from 'vitest';
import { charWbNgrams, cleanNarration, loadClassifier, ModelFormatError, type ModelJson } from '../../src/engine/classifier';
import { enrich } from '../../src/engine/categorize';
import { detectRail } from '../../src/engine/narration';
import type { ClassifierInput, Direction, Rail } from '../../src/engine/types';
import { raw, readText } from '../helpers';

const MODEL: ModelJson = JSON.parse(readText('public/model.json'));
const model = loadClassifier(MODEL);

interface ParityCase {
  narration: string;
  dir: Direction;
  amount: number;
  day: number;
  rail: Rail;
  probabilities: Record<string, number>;
}
const PARITY: { model_version: string; tolerance: number; cases: ParityCase[] } = JSON.parse(
  readText('tests/fixtures/classifier_parity.json'),
);

describe('parity with Python (ml/train.py writes the fixture)', () => {
  it('fixture was made from the current model.json', () => {
    // If this fails, public/model.json and the fixture are out of step: run `python train.py` in ml/.
    expect(PARITY.model_version).toBe(model.version);
    expect(PARITY.cases).toHaveLength(50);
  });

  it.each(PARITY.cases.map((c, i) => [i, c.narration, c] as const))('case %i: %j', (_i, _n, c) => {
    expect(detectRail(c.narration)).toBe(c.rail);
    const got = model.predict({ narration: c.narration, dir: c.dir, amount: c.amount, day: c.day, rail: c.rail });
    expect(got.map((s) => s.category).sort()).toEqual(Object.keys(c.probabilities).sort());
    for (const s of got) expect(Math.abs(s.probability - c.probabilities[s.category]!)).toBeLessThan(PARITY.tolerance);
  });
});

describe('cleanNarration (spec step 1, same cases as ml/test_features.py)', () => {
  it.each([
    ['UPI/CR/363020409019/UPI', 'upi cr # upi'],
    ['POS SETT/567599/HDFC', 'pos sett # hdfc'],
    ['UPI/abc12@okhdfcbank', 'upi abc#@okhdfcbank'],
    ['CHRG:SMS/AMB/TXN', 'chrg sms amb txn'],
    ['  NEFT--METRO   WH  ', 'neft metro wh'],
    ['₹500 Rs.12,345.00 Dr', '# rs # # # dr'],
    ['', ''],
    ['CAFÉ İSTANBUL', 'caf stanbul'],
  ])('%j -> %j', (input, want) => expect(cleanNarration(input)).toBe(want));
});

describe('charWbNgrams (spec step 2)', () => {
  it('pads words and keeps sklearn short-word rule', () => {
    expect(charWbNgrams('a')).toEqual([' a ']);
    expect(charWbNgrams('ab')).toEqual([' ab', 'ab ', ' ab ']);
    expect(charWbNgrams('')).toEqual([]);
    expect(charWbNgrams('upi')).toEqual([' up', 'upi', 'pi ', ' upi', 'upi ', ' upi ']);
  });
});

describe('predict', () => {
  const input: ClassifierInput = { narration: 'UPI REVERSAL/123456789', dir: 'D', amount: 800, day: 12, rail: 'UPI' };

  it('returns every class once, sorted, summing to 1', () => {
    const out = model.predict(input);
    expect(out).toHaveLength(MODEL.classes.length);
    expect(new Set(out.map((s) => s.category)).size).toBe(out.length);
    for (let i = 1; i < out.length; i++) expect(out[i - 1]!.probability).toBeGreaterThanOrEqual(out[i]!.probability);
    expect(out.reduce((a, s) => a + s.probability, 0)).toBeCloseTo(1, 12);
  });

  it('is deterministic', () => {
    expect(model.predict(input)).toEqual(model.predict({ ...input }));
  });

  it('handles an empty or unseen narration', () => {
    for (const narration of ['', 'QQQQ']) {
      const out = model.predict({ ...input, narration });
      expect(out.every((s) => Number.isFinite(s.probability))).toBe(true);
    }
  });
});

describe('loadClassifier rejects a model that does not fit this code', () => {
  const broken = (patch: Partial<ModelJson> | Record<string, unknown>) => () => loadClassifier({ ...MODEL, ...patch });
  it.each([
    ['not an object', () => loadClassifier(null)],
    ['wrong format', broken({ format: 2 as 1 })],
    ['unknown class', broken({ classes: [...MODEL.classes.slice(1), 'groceries'] })],
    ['idf length', broken({ idf: MODEL.idf.slice(1) })],
    ['coef shape', broken({ coef: MODEL.coef.map((r) => r.slice(1)) })],
    ['rail order', broken({ features: { ...MODEL.features, rails: [...MODEL.features.rails].reverse() } })],
  ])('%s', (_name, fn) => expect(fn).toThrow(ModelFormatError));
});

describe('in categorize: owner > rule > model (>= 0.8) > review', () => {
  it('uses the model when no rule matches', () => {
    // No rule covers a sale reversal going out; the model learned these as "other".
    const [t] = enrich([raw('2026-05-12', 'UPI REVERSAL/555001234', -640)], {}, model);
    expect(t!.source).toBe('model');
    expect(t!.category).toBe('other');
    expect(t!.confidence).toBeGreaterThanOrEqual(0.8);
  });

  it('keeps rules first', () => {
    const [t] = enrich([raw('2026-05-12', 'UPI/CR/123456789012/UPI', 5000)], {}, model);
    expect(t!.source).toBe('rule');
  });

  it('owner override still wins', () => {
    const [plain] = enrich([raw('2026-05-12', 'UPI REVERSAL/555001234', -640)], {}, model);
    const [t] = enrich([raw('2026-05-12', 'UPI REVERSAL/555001234', -640)], { [plain!.key]: 'personal' }, model);
    expect(t!.source).toBe('owner');
  });

  it('sends a payee-less UPI withdrawal to review with two suggestions', () => {
    // Hard case: "UPI/<ref>" money out is rent, suppliers, tax... in the data. Nothing to go on.
    const [t] = enrich([raw('2026-05-12', 'UPI/680266970934', -2300)], {}, model);
    expect(t!.source).toBe('review');
    expect(t!.suggestions).toHaveLength(2);
    expect(t!.suggestions.every((s) => s.category !== 'sales' && s.category !== 'other_income')).toBe(true);
  });
});
