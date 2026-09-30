import {
  CATEGORIES,
  EXPENSE_CATEGORIES,
  daysInMonth,
  inr,
  monthLabel,
  monthShort,
  type Analysis,
  type CategoryId,
  type MonthIndex,
} from '../../engine';
import type { MonthView } from '../model';
import { catColor } from '../theme';
import { initials } from '../model';
import type { Page } from '../route';
import { SummaryCards } from '../components/SummaryCards';
import { CashFlowChart, ChartLegend } from '../components/CashFlowChart';
import { Alerts } from '../components/Alerts';
import { CardHead } from '../components/PageHeader';
import { Icon } from '../components/Icons';

interface Props {
  analysis: Analysis;
  months: MonthView[];
  onNavigate: (p: Page) => void;
  onShowCategory: (c: CategoryId, m: MonthIndex) => void;
  onOpenMonth: (m: MonthIndex) => void;
}

export function Overview({ analysis: a, months, onNavigate, onShowCategory, onOpenMonth }: Props) {
  return (
    <div className="page">
      <SummaryCards analysis={a} months={months} />

      <div className="grid-main">
        <section className="panel">
          <CardHead title="Cash flow" sub="Money in and out each month, with next month’s forecast.">
            <button className="link" onClick={() => onNavigate('cashflow')}>
              Details <Icon.arrowRight />
            </button>
          </CardHead>
          <CashFlowChart months={months} height={260} onSelect={onOpenMonth} />
          <ChartLegend />
        </section>
        <Upcoming analysis={a} onMore={() => onNavigate('recurring')} />
      </div>

      <div className="grid-two">
        <Alerts alerts={a.alerts} />
        <SpendBreakdown analysis={a} months={months} onShowCategory={onShowCategory} />
      </div>
    </div>
  );
}

function SpendBreakdown({ analysis: a, months, onShowCategory }: Omit<Props, 'onNavigate' | 'onOpenMonth'>) {
  const m = months.find((x) => x.month === a.budgetMonth);
  if (!m) return null;
  const rows = EXPENSE_CATEGORIES.map((c) => [c, m.byCategory[c] ?? 0] as const)
    .filter(([, v]) => v > 0)
    .sort((p, q) => q[1] - p[1]);
  const total = rows.reduce((s, [, v]) => s + v, 0) || 1;

  return (
    <section className="panel">
      <CardHead title="Where money went" sub={`${monthLabel(m.month, true)} · ${inr(m.outflow)} out`} />
      <div className="stackbar" aria-hidden="true">
        {rows.map(([c, v]) => (
          <i key={c} style={{ width: `${(v / total) * 100}%`, background: catColor(c) }} />
        ))}
      </div>
      <ul className="spend">
        {rows.map(([c, v]) => (
          <li key={c}>
            <button onClick={() => onShowCategory(c, m.month)} title="Show these transactions">
              <span className="sw" style={{ background: catColor(c) }} />
              <span className="name">{CATEGORIES[c].name}</span>
              <span className="pct tnum">{Math.round((v / total) * 100)}%</span>
              <span className="tnum">{inr(v)}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Upcoming({ analysis: a, onMore }: { analysis: Analysis; onMore: () => void }) {
  const next = [...a.recurring]
    .sort((p, q) => p.next - q.next || p.day - q.day)
    .slice(0, 5);
  return (
    <section className="panel">
      <CardHead title="Upcoming payments" sub="Recurring payments expected next.">
        {a.recurring.length > 0 && (
          <button className="link" onClick={onMore}>
            All {a.recurring.length} <Icon.arrowRight />
          </button>
        )}
      </CardHead>
      {next.length ? (
        <div className="rlist">
          {next.map((r) => (
            <div className="rline" key={r.key}>
              <span className="avatar" style={{ background: catColor(r.category) }} aria-hidden="true">
                {initials(r.payee)}
              </span>
              <div className="who">
                <b>{r.payee}</b>
                <span>{CATEGORIES[r.category].name}</span>
              </div>
              <div className="amt">
                <span className="tnum">{inr(r.amount)}</span>
                <span>
                  {Math.min(r.day, daysInMonth(r.next))} {monthShort(r.next)}
                </span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="empty-note">No repeating payments found yet. They show up once a payee appears in 3 or more months.</p>
      )}
    </section>
  );
}
