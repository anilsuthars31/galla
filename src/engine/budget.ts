/* Per-category monthly limits.
   Suggested limit = typical (median) month, never below the category's fixed monthly payments,
   rounded up to ₹500. "Over" means the latest full month is more than 10% above the limit. */
import type { BudgetLine, MonthSummary, Recurring } from './types';
import { CATEGORIES, EXPENSE_CATEGORIES } from './types';
import { mean, median, sum } from './stats';

export const BUDGET_ROUNDING = 500;
export const OVER_TOLERANCE = 1.1;

export function buildBudget(basis: readonly MonthSummary[], recurring: readonly Recurring[]): BudgetLine[] {
  const latest = basis[basis.length - 1];
  return EXPENSE_CATEGORIES.map((id): BudgetLine => {
    const trend = basis.map((m) => m.byCategory[id] ?? 0);
    const fixed = sum(recurring.filter((r) => r.category === id && r.frequency === 'monthly').map((r) => r.perMonth));
    const limit = Math.ceil(Math.max(median(trend), fixed) / BUDGET_ROUNDING) * BUDGET_ROUNDING;
    const actual = latest?.byCategory[id] ?? 0;
    const over = limit ? actual > limit * OVER_TOLERANCE : actual > 0;
    return {
      id,
      name: CATEGORIES[id].name,
      limit,
      actual,
      average: mean(trend),
      total: sum(trend),
      status: over ? 'over' : 'ok',
      trend,
    };
  }).filter((b) => b.total > 0);
}
