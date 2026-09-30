/* Category decision. Order: owner override > setup payee (profile) > rule > model (p >= 0.8) > needs review.
   The model is optional: pass a Classifier (src/engine/classifier.ts, V3) to enable it.
   Setup payees come before keyword rules because "Suresh Pawar is my employee" is more specific
   than any keyword; they only ever match money going out. */
import type { Categorization, Classifier, Direction, ExpenseCategory, Overrides, RawTxn, Rail, Txn } from './types';
import type { PayeeRule } from './profile';
import { buildProfileMatcher } from './profileMatch';
import { isIncomeCategory } from './types';
import { RULES, ruleCategory, type Rule } from './rules';
import { detectRail, extractPayee, payeeKey } from './narration';
import { dayOf } from './months';

export const MODEL_THRESHOLD = 0.8;

export interface CategorizeInput {
  narration: string;
  dir: Direction;
  amount: number;
  date: string;
  rail: Rail;
  key: string;
  /** Category of the setup payee this row matched, if any. */
  profile?: ExpenseCategory | null;
}

/** Safe fallback while a row waits for review, so totals still add up. */
const fallback = (dir: Direction) => (dir === 'C' ? 'sales' : 'other');

export function categorize(
  t: CategorizeInput,
  overrides: Overrides = {},
  classifier?: Classifier,
  rules: readonly Rule[] = RULES,
): Categorization {
  const own = overrides[t.key];
  // An override only counts when it matches the direction (an income category for money in).
  if (own && (t.dir === 'C') === isIncomeCategory(own)) {
    return { category: own, source: 'owner', confidence: 1, suggestions: [] };
  }
  if (t.profile && t.dir === 'D') return { category: t.profile, source: 'profile', confidence: 1, suggestions: [] };
  const rule = ruleCategory(t.narration, t.dir, rules);
  if (rule) return { category: rule, source: 'rule', confidence: 1, suggestions: [] };

  if (classifier) {
    const ranked = classifier
      .predict({ narration: t.narration, dir: t.dir, amount: t.amount, day: dayOf(t.date), rail: t.rail })
      .filter((s) => (t.dir === 'C') === isIncomeCategory(s.category));
    const top = ranked[0];
    if (top && top.probability >= MODEL_THRESHOLD) {
      return { category: top.category, source: 'model', confidence: top.probability, suggestions: [] };
    }
    // Below the threshold the model only suggests; the row keeps the fallback until the owner decides.
    return { category: fallback(t.dir), source: 'review', confidence: 0, suggestions: ranked.slice(0, 2) };
  }
  return { category: fallback(t.dir), source: 'review', confidence: 0, suggestions: [] };
}

/**
 * Sorts by date (statement order within a day) and adds rail, payee, key and category.
 * A row that matches a setup payee takes the owner's spelling of the name, so its variants
 * ("SALARY/RAJESH K", "SALARY/RAJESHK") group as one payee.
 */
export function enrich(
  raw: readonly RawTxn[],
  overrides: Overrides = {},
  classifier?: Classifier,
  rules: readonly Rule[] = RULES,
  payees: readonly PayeeRule[] = [],
): Txn[] {
  const match = buildProfileMatcher(payees);
  return [...raw]
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.order - b.order))
    .map((r, id) => {
      const dir: Direction = r.deposit > 0 ? 'C' : 'D';
      const amount = dir === 'C' ? r.deposit : r.withdrawal;
      const rail = detectRail(r.narration);
      const m = match(r.narration, dir, amount);
      const payee = m ? m.payee.name : extractPayee(r.narration, rail);
      const key = payeeKey(payee, dir);
      const cat = categorize(
        { narration: r.narration, dir, amount, date: r.date, rail, key, profile: m?.category ?? null },
        overrides,
        classifier,
        rules,
      );
      return { ...r, id, dir, amount, rail, payee, key, ...cat };
    });
}
