/* Plain-language alerts, ordered as they are shown: shortfalls, low balance, sales trend,
   new fixed payments, budget overruns, then notes. */
import type { Alert, BudgetLine, ForecastMonth, MonthIndex, MonthSummary, Recurring, Txn } from './types';
import { dayOf, monthLabel } from './months';
import { inr } from './format';
import { mean, sum } from './stats';

export interface AlertInput {
  months: readonly MonthSummary[];
  basis: readonly MonthSummary[];
  forecast: readonly ForecastMonth[];
  recurring: readonly Recurring[];
  budget: readonly BudgetLine[];
  budgetMonth: MonthIndex;
  txns: readonly Txn[];
  fixedMonthly: number;
  currentBalance: number | null;
}

/** Sales must move more than 5% between the first and last 3 months to be called a trend. */
const TREND = 0.05;

export function buildAlerts(a: AlertInput): Alert[] {
  const out: Alert[] = [];
  const firstMonth = a.months[0]?.month ?? 0;
  const lastMonth = a.months[a.months.length - 1]?.month ?? 0;

  for (const f of a.forecast) {
    if (f.net >= 0) continue;
    const big = f.dueQuarterly[0];
    out.push({
      level: 'critical',
      title: `${monthLabel(f.month)}: expected shortfall of ${inr(-f.net)}`,
      body:
        `Likely outflow ${inr(f.outflow)} against inflow ${inr(f.inflow)}.` +
        (big ? ` ${big.payee} (${inr(big.amount)}, quarterly) falls due this month.` : '') +
        ' Hold back stock purchases or collect dues early.',
    });
  }

  if (a.currentBalance !== null && a.fixedMonthly && a.forecast.length) {
    const low = a.forecast.reduce((m, f) => ((f.endBalance ?? 0) < (m.endBalance ?? 0) ? f : m));
    if ((low.endBalance ?? 0) < a.fixedMonthly) {
      out.push({
        level: 'warning',
        title: 'Balance may drop below one month of fixed costs',
        body: `Projected ${inr(low.endBalance ?? 0)} at the end of ${monthLabel(low.month)}. Your fixed monthly payments add up to ${inr(a.fixedMonthly)}.`,
      });
    }
  }

  const sales = a.basis.map((m) => m.byCategory.sales ?? 0);
  if (sales.length >= 6) {
    const early = mean(sales.slice(0, 3));
    const late = mean(sales.slice(-3));
    const ch = early > 0 ? (late - early) / early : 0;
    if (ch < -TREND) {
      out.push({
        level: 'warning',
        title: `Sales down ${Math.round(-ch * 100)}% in the last 3 months`,
        body: `Average ${inr(late)} a month, down from ${inr(early)}. The forecast uses the lower figure.`,
      });
    } else if (ch > TREND) {
      out.push({
        level: 'good',
        title: `Sales up ${Math.round(ch * 100)}% in the last 3 months`,
        body: `Average ${inr(late)} a month, up from ${inr(early)}. The forecast still uses the lower long-run average.`,
      });
    }
  }

  const newMonthly = a.recurring.filter((r) => r.frequency === 'monthly' && r.since >= lastMonth - 3 && r.since > firstMonth);
  for (const r of newMonthly) {
    out.push({
      level: 'warning',
      title: `New monthly payment: ${r.payee}`,
      body: `${inr(r.amount)} every month since ${monthLabel(r.since)}. It is included in every forecast month.`,
    });
  }

  // A category that is over because of a new fixed payment or a quarterly payment is already explained.
  const explained = new Set([
    ...newMonthly.map((r) => r.category),
    ...a.recurring.filter((r) => r.frequency === 'quarterly' && r.next - 3 === a.budgetMonth).map((r) => r.category),
  ]);
  for (const b of a.budget) {
    if (b.status !== 'over' || !b.limit || explained.has(b.id)) continue;
    out.push({
      level: 'warning',
      title: `${b.name} over the usual level`,
      body: `${inr(b.actual)} last month against a typical ${inr(b.limit)}.`,
    });
  }

  const personal = a.txns.filter((t) => t.category === 'personal');
  if (personal.length) {
    out.push({
      level: 'info',
      title: `${personal.length} personal payment${personal.length > 1 ? 's' : ''} from this account`,
      body: `${inr(sum(personal.map((t) => t.amount)))} in total (food delivery, shopping, subscriptions). Keeping these in a separate account makes the business numbers cleaner.`,
    });
  }

  const charges = a.txns.filter((t) => t.category === 'charges');
  if (charges.length) {
    out.push({
      level: 'info',
      title: `Bank charges: ${inr(sum(charges.map((t) => t.amount)))}`,
      body: `${charges.length} charge${charges.length > 1 ? 's' : ''} across the statement period. Ask your bank if a different account plan removes the QR rental or SMS fees.`,
    });
  }

  const partial = a.months.filter((m) => m.partial);
  if (partial.length && a.basis.length < a.months.length) {
    const t = a.txns;
    const ends = (m: MonthSummary) =>
      m.month === lastMonth && t.length ? `ends on ${dayOf(t[t.length - 1]!.date)} ${monthLabel(m.month)}` : `starts on ${dayOf(t[0]!.date)} ${monthLabel(m.month)}`;
    out.push({
      level: 'info',
      title: `${partial.map((m) => monthLabel(m.month)).join(' and ')} only partly covered`,
      body: `The statement ${partial.map(ends).join(' and ')}, so ${partial.length > 1 ? 'these months are' : 'that month is'} left out of the averages, budget and forecast.`,
    });
  }

  if (a.basis.length < 3) {
    out.push({
      level: 'info',
      title: `Only ${a.basis.length} full month${a.basis.length === 1 ? '' : 's'} of history`,
      body: 'The forecast and budget limits are rough until there are at least 3 full months. Upload a statement covering 6 to 12 months for better numbers.',
    });
  }

  return out;
}
