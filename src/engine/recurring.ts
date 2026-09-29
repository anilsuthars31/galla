/* Recurring payment detection: same payee, similar amount, similar day, monthly or quarterly. */
import type { MonthIndex, Recurring, Txn } from './types';
import { dayOf, monthOf } from './months';
import { mean, median, sd, sum } from './stats';

/** Max coefficient of variation of amounts (35%). */
const MAX_CV = 0.35;
/** Max spread of the payment day (standard deviation in days). */
const MAX_DAY_SD = 5;

/**
 * Monthly: seen in >= 3 months, about once a month, similar amount and day, and still active
 * (seen in the last or second-to-last month). Quarterly: one payment every 3 months, >= 2 times.
 * ATM withdrawals are never recurring.
 */
export function findRecurring(txns: readonly Txn[], lastMonth: MonthIndex): Recurring[] {
  const groups = new Map<string, Txn[]>();
  for (const t of txns) {
    if (t.dir !== 'D' || t.rail === 'ATM') continue;
    const g = groups.get(t.key);
    if (g) g.push(t);
    else groups.set(t.key, [t]);
  }
  const out: Recurring[] = [];
  for (const [key, list] of groups) {
    const ms = [...new Set(list.map((t) => monthOf(t.date)))].sort((a, b) => a - b);
    const amounts = list.map((t) => t.amount);
    const days = list.map((t) => dayOf(t.date));
    const avg = mean(amounts);
    const cv = avg ? sd(amounts) / avg : 1;
    const first = ms[0]!;
    const latest = ms[ms.length - 1]!;
    const base = {
      key,
      payee: list[0]!.payee,
      category: list[list.length - 1]!.category,
      amount: Math.round(median(amounts)),
      day: Math.round(median(days)),
      count: list.length,
      txnIds: list.map((t) => t.id),
      since: first,
      months: ms.length,
    };
    if (ms.length >= 3 && list.length / ms.length <= 1.5 && cv <= MAX_CV && sd(days) <= MAX_DAY_SD && latest >= lastMonth - 1) {
      out.push({ ...base, frequency: 'monthly', perMonth: Math.round(sum(amounts) / ms.length), next: lastMonth + 1 });
    } else if (ms.length >= 2 && list.length === ms.length && cv <= MAX_CV) {
      const gaps = ms.slice(1).map((m, i) => m - ms[i]!);
      if (gaps.every((g) => g === 3)) out.push({ ...base, frequency: 'quarterly', perMonth: 0, next: latest + 3 });
    }
  }
  return out.sort((a, b) => b.amount - a.amount);
}
