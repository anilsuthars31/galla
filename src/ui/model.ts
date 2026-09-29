/* Presentation shapes built from engine output. No finance logic here. */
import type { Analysis, CategoryAmounts, MonthIndex, Recurring } from '../engine';

export interface MonthView {
  month: MonthIndex;
  inflow: number;
  outflow: number;
  byCategory: CategoryAmounts;
  endBalance: number | null;
  forecast: boolean;
  partial: boolean;
  dueQuarterly: Recurring[];
}

/** Actual months followed by forecast months. */
export function monthViews(a: Analysis): MonthView[] {
  return [
    ...a.months.map((m) => ({
      month: m.month,
      inflow: m.inflow,
      outflow: m.outflow,
      byCategory: m.byCategory,
      endBalance: m.endBalance,
      forecast: false,
      partial: m.partial,
      dueQuarterly: [],
    })),
    ...a.forecast.map((f) => ({
      month: f.month,
      inflow: f.inflow,
      outflow: f.outflow,
      byCategory: f.byCategory,
      endBalance: f.endBalance,
      forecast: true,
      partial: false,
      dueQuarterly: f.dueQuarterly,
    })),
  ];
}

export const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter((w) => /^[a-z0-9]/i.test(w))
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join('') || '•';
