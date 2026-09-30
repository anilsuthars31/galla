import type { ReactNode } from 'react';
import { formatDate, inr, inrShort, monthLabel, signedInr, type Analysis } from '../../engine';
import type { MonthView } from '../model';
import { Icon } from './Icons';
import { NetBars, Sparkline } from './Sparkline';

interface Card {
  label: string;
  value: string;
  sub: string;
  icon: ReactNode;
  chart: ReactNode;
  bad?: boolean;
}

export function SummaryCards({ analysis: a, months }: { analysis: Analysis; months: MonthView[] }) {
  const firstForecast = months.findIndex((m) => m.forecast);
  const next = a.forecast[0]!;
  const n = a.basisMonths.length;

  const cards: Card[] = [
    {
      label: 'Money in · monthly avg',
      value: inr(a.avgInflow),
      sub: `Across ${n} full month${n === 1 ? '' : 's'}`,
      icon: <Icon.arrowIn />,
      chart: <Sparkline values={months.map((m) => m.inflow)} forecastFrom={firstForecast} color="var(--money-in)" />,
    },
    {
      label: 'Money out · monthly avg',
      value: inr(a.avgOutflow),
      sub: a.fixedMonthly ? `${inrShort(a.fixedMonthly)} of it is fixed payments` : 'No fixed payments found yet',
      icon: <Icon.arrowOut />,
      chart: <Sparkline values={months.map((m) => m.outflow)} forecastFrom={firstForecast} color="var(--money-out)" />,
    },
    {
      label: 'Bank balance',
      value: a.currentBalance !== null ? inr(a.currentBalance) : '—',
      sub: a.currentBalance !== null ? `On ${formatDate(a.period.to)}` : 'No balance column in the file',
      icon: <Icon.bank />,
      chart: a.hasBalance ? <Sparkline values={months.map((m) => m.endBalance)} forecastFrom={firstForecast} color="var(--accent)" /> : null,
    },
    {
      label: `${monthLabel(next.month)} · expected net`,
      value: signedInr(next.net),
      sub: `${inrShort(next.inflow)} in, ${inrShort(next.outflow)} out, if spending stays as usual`,
      icon: <Icon.calendar />,
      chart: <NetBars values={months.map((m) => m.inflow - m.outflow)} />,
      bad: next.net < 0,
    },
  ];

  return (
    <section className="kpis" aria-label="Summary">
      {cards.map((c, i) => (
        <div key={c.label} className={`panel kpi${c.bad ? ' bad' : ''}`} style={{ animationDelay: `${i * 60}ms` }}>
          <span className="eyebrow">{c.label}</span>
          <span className="v">{c.value}</span>
          <span className="s">{c.sub}</span>
          <div className="spark">{c.chart}</div>
          <span className="kpi-icon">{c.icon}</span>
        </div>
      ))}
    </section>
  );
}
