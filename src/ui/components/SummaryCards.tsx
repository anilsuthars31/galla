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
  const net3 = a.forecast.reduce((s, f) => s + f.net, 0);
  const worst = a.forecast.reduce((m, f) => (f.net < m.net ? f : m), a.forecast[0]!);
  const n = a.basisMonths.length;

  const cards: Card[] = [
    {
      label: 'Money in · monthly avg',
      value: inr(a.avgInflow),
      sub: `Across ${n} full month${n === 1 ? '' : 's'}`,
      icon: <Icon.arrowIn />,
      chart: <Sparkline values={months.map((m) => m.inflow)} forecastFrom={firstForecast} color="var(--good)" />,
    },
    {
      label: 'Money out · monthly avg',
      value: inr(a.avgOutflow),
      sub: a.fixedMonthly ? `${inrShort(a.fixedMonthly)} of it is fixed payments` : 'No fixed payments found yet',
      icon: <Icon.arrowOut />,
      chart: <Sparkline values={months.map((m) => m.outflow)} forecastFrom={firstForecast} color="var(--s2)" />,
    },
    {
      label: 'Bank balance',
      value: a.currentBalance !== null ? inr(a.currentBalance) : '—',
      sub: a.currentBalance !== null ? `On ${formatDate(a.period.to)}` : 'No balance column in the file',
      icon: <Icon.bank />,
      chart: a.hasBalance ? <Sparkline values={months.map((m) => m.endBalance)} forecastFrom={firstForecast} color="var(--s1)" /> : null,
    },
    {
      label: 'Next 3 months · net',
      value: signedInr(net3),
      sub: worst.net < 0 ? `${monthLabel(worst.month)} runs ${inrShort(-worst.net)} short` : 'Every forecast month stays positive',
      icon: <Icon.calendar />,
      chart: <NetBars values={a.forecast.map((f) => f.net)} />,
      bad: worst.net < 0,
    },
  ];

  return (
    <section className="kpis" aria-label="Summary">
      {cards.map((c, i) => (
        <div key={c.label} className={`panel kpi section-enter${c.bad ? ' bad' : ''}`} style={{ animationDelay: `${i * 60}ms` }}>
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
