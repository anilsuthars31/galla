/* Per-category monthly budget.
   Suggested = typical (median) month, never below the category's fixed monthly payments, rounded up
   to ₹500. The owner can replace any suggestion with their own amount (`limits`); that amount is then
   the budget. "Over" means the latest full month is more than 10% above the budget. */
import type { BudgetLimits, BudgetLine, CategoryAmounts, MonthSummary, Recurring } from './types';
import { CATEGORIES, EXPENSE_CATEGORIES } from './types';
import { mean, median, sum } from './stats';

export const BUDGET_ROUNDING = 500;
export const OVER_TOLERANCE = 1.1;

export function buildBudget(
  basis: readonly MonthSummary[],
  recurring: readonly Recurring[],
  limits: BudgetLimits = {},
  expected: CategoryAmounts = {},
): BudgetLine[] {
  const latest = basis[basis.length - 1];
  return EXPENSE_CATEGORIES.map((id): BudgetLine => {
    const trend = basis.map((m) => m.byCategory[id] ?? 0);
    const fixed = sum(recurring.filter((r) => r.category === id && r.frequency === 'monthly').map((r) => r.perMonth));
    const suggested = Math.ceil(Math.max(median(trend), fixed) / BUDGET_ROUNDING) * BUDGET_ROUNDING;
    const own = limits[id];
    const custom = typeof own === 'number' && Number.isFinite(own) && own >= 0;
    const limit = custom ? own : suggested;
    const actual = latest?.byCategory[id] ?? 0;
    const over = limit ? actual > limit * OVER_TOLERANCE : actual > 0;
    return {
      id,
      name: CATEGORIES[id].name,
      limit,
      suggested,
      custom,
      expected: expected[id] ?? 0,
      actual,
      average: mean(trend),
      total: sum(trend),
      status: over ? 'over' : 'ok',
      trend,
    };
  }).filter((b) => b.total > 0 || b.custom);
}
