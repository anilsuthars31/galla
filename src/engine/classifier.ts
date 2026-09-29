/* V3 classifier, inference only. Training happens in ml/train.py, which writes public/model.json.
   Feature extraction follows the spec in the ml/features.py docstring exactly; change both together.
   tests/engine/classifier.test.ts checks that 50 inputs give the same probabilities as Python (1e-6).
   Pure: the caller fetches model.json and passes the parsed JSON in. */
import type { CategoryId, Classifier, ClassifierInput, Rail, Suggestion } from './types';
import { isCategoryId } from './types';

/** Same order as RAILS in ml/features.py (and the Rail type). */
export const RAILS: readonly Rail[] = [
  'UPI', 'NEFT', 'IMPS', 'RTGS', 'NACH', 'ATM', 'Charge', 'Interest', 'Cash', 'Cheque', 'Bill pay', 'Card', 'Other',
];
const DENSE_NAMES = ['is_credit', 'log_amount', 'day', ...RAILS.map((r) => `rail_${r}`)];

/** The parts of public/model.json that inference uses. */
export interface ModelJson {
  format: 1;
  version: string;
  trained_at: string;
  classes: string[];
  multiclass: 'ovr';
  features: { analyzer: 'char_wb'; ngram_range: [number, number]; dense: string[]; rails: string[] };
  vocabulary: string[];
  idf: number[];
  /** One row per class; columns = vocabulary, then the dense features. */
  coef: number[][];
  intercept: number[];
}

export class ModelFormatError extends Error {}

/** Spec step 1: A-Z -> a-z, digit runs -> "#", anything but a-z # @ -> space, trim. */
export function cleanNarration(narration: string): string {
  return narration
    .replace(/[A-Z]/g, (c) => c.toLowerCase())
    .replace(/[0-9]+/g, '#')
    .replace(/[^a-z#@]+/g, ' ')
    .trim();
}

/** Spec step 2: sklearn's char_wb n-grams, including its short-word rule. */
export function charWbNgrams(cleaned: string, lo = 3, hi = 5): string[] {
  const out: string[] = [];
  for (const word of cleaned.split(' ')) {
    if (!word) continue;
    const w = ` ${word} `;
    for (let n = lo; n <= hi; n++) {
      if (w.length <= n) {
        out.push(w);
        break;
      }
      for (let i = 0; i + n <= w.length; i++) out.push(w.slice(i, i + n));
    }
  }
  return out;
}

function sigmoid(z: number): number {
  if (z >= 0) return 1 / (1 + Math.exp(-z));
  const e = Math.exp(z);
  return e / (1 + e);
}

function check(ok: boolean, what: string): asserts ok {
  if (!ok) throw new ModelFormatError(`model.json: ${what}`);
}

function validate(json: unknown): ModelJson {
  check(typeof json === 'object' && json !== null, 'not a JSON object');
  const m = json as ModelJson;
  check(m.format === 1, `unsupported format ${String(m.format)}`);
  check(m.multiclass === 'ovr', 'expected a one-vs-rest model');
  check(m.features?.analyzer === 'char_wb', 'expected char_wb features');
  check(Array.isArray(m.classes) && m.classes.length > 0 && m.classes.every(isCategoryId), 'unknown category in classes');
  check(Array.isArray(m.vocabulary) && Array.isArray(m.idf) && m.idf.length === m.vocabulary.length, 'idf and vocabulary differ in length');
  check(JSON.stringify(m.features.rails) === JSON.stringify(RAILS), 'rail list differs from the app');
  check(JSON.stringify(m.features.dense) === JSON.stringify(DENSE_NAMES), 'dense features differ from the app');
  const width = m.vocabulary.length + DENSE_NAMES.length;
  check(Array.isArray(m.coef) && m.coef.length === m.classes.length && m.coef.every((r) => r.length === width), 'coef has the wrong shape');
  check(Array.isArray(m.intercept) && m.intercept.length === m.classes.length, 'intercept has the wrong length');
  return m;
}

export interface LoadedClassifier extends Classifier {
  version: string;
  trainedAt: string;
}

/** Builds the classifier from parsed model.json. Throws ModelFormatError if the file doesn't fit this code. */
export function loadClassifier(json: unknown): LoadedClassifier {
  const m = validate(json);
  const [lo, hi] = m.features.ngram_range;
  const index = new Map(m.vocabulary.map((g, i) => [g, i] as const));
  const nText = m.vocabulary.length;
  const classes = m.classes as CategoryId[];

  function features(input: ClassifierInput): { text: Map<number, number>; dense: number[] } {
    const counts = new Map<number, number>();
    for (const g of charWbNgrams(cleanNarration(input.narration), lo, hi)) {
      const i = index.get(g);
      if (i !== undefined) counts.set(i, (counts.get(i) ?? 0) + 1);
    }
    let sq = 0;
    for (const [i, c] of counts) {
      const v = c * m.idf[i]!;
      counts.set(i, v);
      sq += v * v;
    }
    const norm = Math.sqrt(sq);
    if (norm > 0) for (const [i, v] of counts) counts.set(i, v / norm);
    const dense = [
      input.dir === 'C' ? 1 : 0,
      Math.log1p(input.amount) / 10,
      (input.day - 1) / 30,
      ...RAILS.map((r) => (r === input.rail ? 1 : 0)),
    ];
    return { text: counts, dense };
  }

  return {
    version: m.version,
    trainedAt: m.trained_at,
    predict(input: ClassifierInput): Suggestion[] {
      const { text, dense } = features(input);
      const scores = classes.map((_, k) => {
        const w = m.coef[k]!;
        let z = m.intercept[k]!;
        for (const [i, v] of text) z += w[i]! * v;
        for (let j = 0; j < dense.length; j++) z += w[nText + j]! * dense[j]!;
        return sigmoid(z);
      });
      // One-vs-rest: normalise the per-class probabilities to sum to 1 (as sklearn does).
      const total = scores.reduce((a, b) => a + b, 0);
      return classes
        .map((category, k) => ({ category, probability: scores[k]! / total, k }))
        .sort((a, b) => b.probability - a.probability || a.k - b.k)
        .map(({ category, probability }) => ({ category, probability }));
    },
  };
}
