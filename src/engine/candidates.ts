/* Regular payees worth asking the owner about ("Who are these?"): money out, paid in 2+ months, and not
   already decided by the owner, their setup or a keyword rule. Pure; the UI decides how to ask. */
import { dayOf, monthOf } from './months';
import type { CategoryId, CategorySource, Txn } from './types';

export interface PayeeCandidate {
  key: string;
  payee: string;
  count: number;
  /** Distinct months with a payment. */
  months: number;
  /** Median payment, rounded to the rupee. */
  amount: number;
  /** Median day of the month. */
  day: number;
  total: number;
  /** Galla's current answer, and where it came from ('review' or 'model'). */
  category: CategoryId;
  source: CategorySource;
}

const MIN_MONTHS = 2;
const ASKABLE: ReadonlySet<CategorySource> = new Set(['review', 'model']);
/** Payees named after the kind of payment, not a person or firm: nothing to ask. */
const NOT_A_PAYEE = /^(Unnamed |ATM withdrawal$|Bank charges$|Bank interest$|Cash deposit$|GST payment$|Advance tax$|TDS payment$)/;

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

export function payeeCandidates(txns: readonly Txn[], limit = 8): PayeeCandidate[] {
  const groups = new Map<string, Txn[]>();
  for (const t of txns) {
    if (t.dir !== 'D' || !ASKABLE.has(t.source) || NOT_A_PAYEE.test(t.payee)) continue;
    const g = groups.get(t.key);
    if (g) g.push(t);
    else groups.set(t.key, [t]);
  }
  const out: PayeeCandidate[] = [];
  for (const [key, g] of groups) {
    const months = new Set(g.map((t) => monthOf(t.date))).size;
    if (months < MIN_MONTHS) continue;
    const last = g[g.length - 1]!;
    out.push({
      key,
      payee: last.payee,
      count: g.length,
      months,
      amount: Math.round(median(g.map((t) => t.amount))),
      day: Math.round(median(g.map((t) => dayOf(t.date)))),
      total: g.reduce((s, t) => s + t.amount, 0),
      category: last.category,
      source: g.some((t) => t.source === 'review') ? 'review' : last.source,
    });
  }
  // Unsorted rows first (they are what the owner has to fix), then by money involved.
  return out.sort((a, b) => Number(b.source === 'review') - Number(a.source === 'review') || b.total - a.total).slice(0, limit);
}
