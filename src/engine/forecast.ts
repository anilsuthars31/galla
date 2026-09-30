/* Conservative cash forecast for next month (more months on request: `horizon`).
   Every month uses the same averages, so a longer horizon would only repeat the same numbers (D19).
   Income per category  = lower of (last-3-month average, whole-period average).
   Expense per category = recurring monthly payments at their usual amount
                        + quarterly payments in the months they fall due
                        + average of everything else over the last 3 months.
   Do not add ML here without evaluating it against this baseline (CLAUDE.md). */
import type { CategoryAmounts, ExpenseCategory, ForecastMonth, MonthIndex, MonthSummary, Recurring } from './types';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from './types';
import { mean, sum } from './stats';

/** Non-recurring spend: category -> month -> amount. */
export type NonRecurringSpend = Partial<Record<ExpenseCategory, Record<MonthIndex, number>>>;

export interface ForecastInput {
  /** Months used for averages, oldest first (full months). */
  basis: readonly MonthSummary[];
  /** Last month in the statement; the forecast starts the month after. */
  lastMonth: MonthIndex;
  recurring: readonly Recurring[];
  nonRecurring: NonRecurringSpend;
  /** Balance at the end of the statement, or null when the file has no balances. */
  startBalance: number | null;
  horizon?: number;
}

/** The app forecasts next month only (D19). */
export const FORECAST_MONTHS = 1;

/** Lower of the recent (last 3) and whole-period averages. */
export function conservativeAverage(series: readonly number[]): number {
  return Math.min(mean(series.slice(-3)), mean(series));
}

/** True when a quarterly payment falls due in month m. */
export function isDue(r: Recurring, m: MonthIndex): boolean {
  return r.frequency === 'quarterly' && m >= r.next && (m - r.next) % 3 === 0;
}

export function buildForecast(input: ForecastInput): ForecastMonth[] {
  const { basis, lastMonth, recurring, nonRecurring, horizon = FORECAST_MONTHS } = input;
  const last3 = basis.slice(-3).map((m) => m.month);
  const out: ForecastMonth[] = [];
  let balance = input.startBalance;
  for (let f = 1; f <= horizon; f++) {
    const month = lastMonth + f;
    const byCategory: CategoryAmounts = {};
    const dueQuarterly: Recurring[] = [];
    for (const c of INCOME_CATEGORIES) {
      const v = conservativeAverage(basis.map((m) => m.byCategory[c] ?? 0));
      if (v > 0) byCategory[c] = v;
    }
    for (const c of EXPENSE_CATEGORIES) {
      let v = mean(last3.map((mm) => nonRecurring[c]?.[mm] ?? 0));
      for (const r of recurring) {
        if (r.category !== c) continue;
        if (r.frequency === 'monthly') v += r.perMonth;
        else if (isDue(r, month)) {
          v += r.amount;
          dueQuarterly.push(r);
        }
      }
      if (v > 0) byCategory[c] = v;
    }
    const inflow = sum(INCOME_CATEGORIES.map((c) => byCategory[c] ?? 0));
    const outflow = sum(EXPENSE_CATEGORIES.map((c) => byCategory[c] ?? 0));
    if (balance !== null) balance += inflow - outflow;
    out.push({ month, inflow, outflow, net: inflow - outflow, byCategory, endBalance: balance, dueQuarterly });
  }
  return out;
}
