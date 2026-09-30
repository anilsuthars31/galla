import {
  CATEGORIES,
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  inr,
  inrShort,
  monthLabel,
  type CategoryId,
  type MonthIndex,
} from '../../engine';
import type { MonthView } from '../model';
import { catColor } from '../theme';
import { Icon } from './Icons';

interface Props {
  months: MonthView[];
  selected: MonthIndex;
  onSelect: (m: MonthIndex) => void;
  onShowCategory: (c: CategoryId, m: MonthIndex) => void;
}

export function MonthDetail({ months, selected, onSelect, onShowCategory }: Props) {
  const i = months.findIndex((m) => m.month === selected);
  const x = months[i];
  if (!x) return null;
  const expenses = EXPENSE_CATEGORIES.map((c) => [c, x.byCategory[c] ?? 0] as const)
    .filter(([, v]) => v > 0)
    .sort((p, q) => q[1] - p[1]);
  const income = INCOME_CATEGORIES.map((c) => [c, x.byCategory[c] ?? 0] as const).filter(([, v]) => v > 0);
  const net = x.inflow - x.outflow;

  const bars = (rows: (readonly [CategoryId, number])[], title: string) => {
    const max = Math.max(1, ...rows.map(([, v]) => v));
    return (
      <div>
        <span className="eyebrow">{title}</span>
        {rows.length ? (
          <div className="bars">
            {rows.map(([c, v]) => (
              <div className="brow" key={c}>
                <span className="sw" style={{ background: catColor(c) }} />
                {x.forecast ? (
                  <span className="name">{CATEGORIES[c].name}</span>
                ) : (
                  <button className="name" onClick={() => onShowCategory(c, x.month)} title="Show these transactions">
                    {CATEGORIES[c].name}
                  </button>
                )}
                <span className="num">{inr(v)}</span>
                <span className="track">
                  <i style={{ width: `${((v / max) * 100).toFixed(1)}%`, background: catColor(c) }} />
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="empty-note">Nothing this month.</p>
        )}
      </div>
    );
  };

  return (
    <aside className="panel detail" aria-live="polite" aria-label="Month detail">
      <div className="phead" style={{ margin: 0, alignItems: 'center' }}>
        <div>
          <span className="eyebrow">Month detail</span>
          <h2>
            {monthLabel(x.month, true)}
            {x.forecast ? (
              <span className="pill sample">Forecast</span>
            ) : x.partial ? (
              <span className="pill neutral">Part month</span>
            ) : (
              <span className="pill good">Actual</span>
            )}
          </h2>
        </div>
        <div className="monthnav">
          <button className="icon-btn" aria-label="Previous month" disabled={i === 0} onClick={() => onSelect(months[i - 1]!.month)}>
            <Icon.left />
          </button>
          <button className="icon-btn" aria-label="Next month" disabled={i === months.length - 1} onClick={() => onSelect(months[i + 1]!.month)}>
            <Icon.right />
          </button>
        </div>
      </div>

      <div className="stat3">
        <div>
          <span className="eyebrow">In</span>
          <span className="num">{inrShort(x.inflow)}</span>
        </div>
        <div>
          <span className="eyebrow">Out</span>
          <span className="num">{inrShort(x.outflow)}</span>
        </div>
        <div>
          <span className="eyebrow">Net</span>
          <span className={`num ${net < 0 ? 'neg' : 'pos'}`}>{inrShort(net)}</span>
        </div>
      </div>

      {bars(expenses, 'Where money went')}
      {bars(income, 'Where it came from')}

      <p className="foot-note">
        {x.forecast
          ? `Estimated from recurring payments${x.dueQuarterly.length ? `, ${x.dueQuarterly.map((r) => `${r.payee} (quarterly)`).join(', ')}` : ''} and the average of the last 3 months.`
          : x.partial
            ? 'The statement covers only part of this month, so it is left out of averages.'
            : 'Click a category to see its transactions.'}
      </p>
    </aside>
  );
}
