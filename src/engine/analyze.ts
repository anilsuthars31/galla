/* Categorized transactions -> monthly summaries, recurring payments, forecast, budget and alerts. */
import type { Analysis, BudgetLimits, MonthIndex, MonthSummary, Txn } from './types';
import { isIncomeCategory } from './types';
import { dayOf, daysInMonth, monthOf } from './months';
import { mean, sum } from './stats';
import { findRecurring } from './recurring';
import { buildForecast, type NonRecurringSpend } from './forecast';
import { buildBudget } from './budget';
import { buildAlerts } from './alerts';
import { MESSAGES, StatementError } from './parse';

/** A month is partial when the statement covers less than this share of its days. */
export const MIN_MONTH_COVERAGE = 0.8;

/** One summary per calendar month from the first to the last transaction (empty months included). */
export function summarizeMonths(txns: readonly Txn[]): MonthSummary[] {
  const firstT = txns[0];
  const lastT = txns[txns.length - 1];
  if (!firstT || !lastT) return [];
  const first = monthOf(firstT.date);
  const last = monthOf(lastT.date);
  const byMonth = new Map<MonthIndex, MonthSummary>();
  for (let m = first; m <= last; m++) {
    const dim = daysInMonth(m);
    const from = m === first ? dayOf(firstT.date) : 1;
    const to = m === last ? dayOf(lastT.date) : dim;
    byMonth.set(m, {
      month: m,
      inflow: 0,
      outflow: 0,
      byCategory: {},
      count: 0,
      endBalance: null,
      partial: (to - from + 1) / dim < MIN_MONTH_COVERAGE,
    });
  }
  for (const t of txns) {
    const s = byMonth.get(monthOf(t.date))!;
    if (t.dir === 'C') s.inflow += t.amount;
    else s.outflow += t.amount;
    s.byCategory[t.category] = (s.byCategory[t.category] ?? 0) + t.amount;
    s.count++;
    if (t.balance !== null) s.endBalance = t.balance;
  }
  return [...byMonth.values()];
}

export interface AnalyzeOptions {
  /** Months to forecast (default: next month only). */
  horizon?: number;
  /** The owner's own budget amounts. */
  limits?: BudgetLimits;
}

export function analyze(txns: readonly Txn[], options: AnalyzeOptions = {}): Analysis {
  const firstT = txns[0];
  const lastT = txns[txns.length - 1];
  if (!firstT || !lastT) throw new StatementError(MESSAGES.noRows);

  const months = summarizeMonths(txns);
  const full = months.filter((m) => !m.partial);
  const basis = full.length ? full : months;
  const lastMonth = months[months.length - 1]!.month;

  const withBalance = txns.filter((t) => t.balance !== null);
  const currentBalance = withBalance.length ? withBalance[withBalance.length - 1]!.balance : null;

  const recurring = findRecurring(txns, lastMonth);
  const recurringIds = new Set(recurring.flatMap((r) => r.txnIds));
  const nonRecurring: NonRecurringSpend = {};
  for (const t of txns) {
    const cat = t.category;
    if (t.dir !== 'D' || recurringIds.has(t.id) || isIncomeCategory(cat)) continue;
    const byMonth = (nonRecurring[cat] ??= {});
    const m = monthOf(t.date);
    byMonth[m] = (byMonth[m] ?? 0) + t.amount;
  }

  const forecast = buildForecast({ basis, lastMonth, recurring, nonRecurring, startBalance: currentBalance, horizon: options.horizon });
  const next = forecast[0]!;
  const budget = buildBudget(basis, recurring, options.limits, next.byCategory);
  const budgetTotal = sum(budget.map((b) => b.limit));
  const plan = { month: next.month, income: next.inflow, budget: budgetTotal, expectedOut: next.outflow, left: next.inflow - budgetTotal };
  const budgetMonth = basis[basis.length - 1]!.month;
  const fixedMonthly = sum(recurring.filter((r) => r.frequency === 'monthly').map((r) => r.perMonth));
  const alerts = buildAlerts({ months, basis, forecast, recurring, budget, budgetMonth, txns, fixedMonthly, currentBalance, plan });

  return {
    months,
    basisMonths: basis.map((m) => m.month),
    forecast,
    recurring,
    budget,
    budgetMonth,
    alerts,
    plan,
    currentBalance,
    hasBalance: currentBalance !== null,
    fixedMonthly,
    avgInflow: mean(basis.map((m) => m.inflow)),
    avgOutflow: mean(basis.map((m) => m.outflow)),
    period: { from: firstT.date, to: lastT.date },
  };
}
