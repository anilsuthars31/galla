/* Next month's budget. Galla suggests an amount per category from the statement (typical month, never
   below fixed payments); the owner can change any of them. The plan card shows what is left of the
   expected money in if they keep to it. */
import { useEffect, useState } from 'react';
import { inr, monthLabel, monthShort, signedInr, type Analysis, type BudgetLine, type ExpenseCategory } from '../../engine';
import { catColor } from '../theme';

interface Props {
  analysis: Analysis;
  onSetLimit: (category: ExpenseCategory, amount: number | null) => void;
}

/** "₹45,000", "45000", "45,000.00" -> 45000; "" -> null; anything else -> 'invalid'. */
export function parseBudget(s: string): number | null | 'invalid' {
  const t = s.replace(/[₹,\s]|rs\.?/gi, '');
  if (!t) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return 'invalid';
  const n = Math.round(Number(t));
  return n <= 10_00_00_000 ? n : 'invalid';
}

export function BudgetPlan({ analysis: a, onSetLimit }: Props) {
  const p = a.plan;
  const last = monthShort(a.budgetMonth);
  const next = monthLabel(p.month, true);
  const over = a.budget.filter((b) => b.status === 'over').length;
  const own = a.budget.filter((b) => b.custom).length;
  const usual = p.income - p.expectedOut;

  return (
    <div className="page">
      <section className="panel plan">
        <div className="phead">
          <div>
            <h2>Plan for {next}</h2>
            <p>Money in is estimated on the safe side: the lower of your recent and long-run average.</p>
          </div>
        </div>
        <div className="plan-stats">
          <div>
            <span className="eyebrow">Expected money in</span>
            <span className="tnum">{inr(p.income)}</span>
          </div>
          <div>
            <span className="eyebrow">Your budget</span>
            <span className="tnum">{inr(p.budget)}</span>
          </div>
          <div className={p.left < 0 ? 'bad' : 'good'}>
            <span className="eyebrow">{p.left < 0 ? 'Short by' : 'Left over'}</span>
            <span className="tnum">{p.left < 0 ? inr(-p.left) : signedInr(p.left)}</span>
          </div>
        </div>
        <ul className="plan-compare">
          <li>
            <b>If you keep to this budget:</b> {p.left < 0 ? <span className="neg">{inr(-p.left)} short</span> : <span className="pos">{inr(p.left)} left</span>}
          </li>
          <li>
            <b>If spending stays as usual</b> ({inr(p.expectedOut)} out, as on Overview):{' '}
            {usual < 0 ? <span className="neg">{inr(-usual)} short</span> : <span className="pos">{inr(usual)} left</span>}
          </li>
        </ul>
        {p.left < 0 && (
          <p className="plan-note">
            This budget spends more than {next}’s expected money in. Lower a category below, or plan how to cover the gap (collect dues, delay a
            stock order).
          </p>
        )}
      </section>

      <section className="panel">
        <div className="phead">
          <div>
            <h2>Budget by category</h2>
            <p>
              Galla’s suggestion is your typical month, never below your fixed payments. Change any amount and Galla uses yours
              {own ? ` (you changed ${own})` : ''}.
            </p>
          </div>
          {over > 0 ? <span className="pill critical">{over} over in {last}</span> : <span className="pill good">All on track in {last}</span>}
        </div>
        <div className="blist" role="table" aria-label="Budget by category">
          <div className="bhead" role="row">
            <span role="columnheader">Category</span>
            <span role="columnheader" className="r">
              {last} actual
            </span>
            <span role="columnheader" className="r">
              Expected {monthShort(p.month)}
            </span>
            <span role="columnheader" className="r">
              Suggested
            </span>
            <span role="columnheader">Your budget</span>
            <span role="columnheader" />
          </div>
          {a.budget.map((b) => (
            <Line key={b.id} b={b} last={last} nextShort={monthShort(p.month)} onSetLimit={onSetLimit} />
          ))}
        </div>
      </section>
    </div>
  );
}

function Line({ b, last, nextShort, onSetLimit }: { b: BudgetLine; last: string; nextShort: string; onSetLimit: Props['onSetLimit'] }) {
  const shown = (n: number) => n.toLocaleString('en-IN');
  const [text, setText] = useState(shown(b.limit));
  const [error, setError] = useState<string | null>(null);
  useEffect(() => setText(shown(b.limit)), [b.limit]);

  const commit = () => {
    const v = parseBudget(text);
    if (v === 'invalid') return setError('Enter an amount in rupees, like 45000.');
    setError(null);
    if (v === null) return setText(shown(b.limit)); // cleared: keep what was there
    setText(shown(v));
    if (v === b.limit && b.custom) return;
    if (v === b.suggested && !b.custom) return;
    onSetLimit(b.id, v);
  };

  const ratio = b.limit ? b.actual / b.limit : b.actual ? 1 : 0;
  const tone = b.status === 'over' ? 'over' : ratio > 1 ? 'near' : '';
  return (
    <div className="bline editable" role="row">
      <span className="catname" role="cell">
        <span className="sw" style={{ background: catColor(b.id) }} />
        <span>{b.name}</span>
      </span>
      <span className="bnums">
        <span className="r num" role="cell">
          <span className="bl-label">{last}</span>
          {inr(b.actual)}
        </span>
        <span className="r num" role="cell">
          <span className="bl-label">Expected {nextShort}</span>
          {inr(b.expected)}
        </span>
        <span className="r num muted" role="cell">
          <span className="bl-label">Suggested</span>
          {inr(b.suggested)}
        </span>
      </span>
      <span className="bedit" role="cell">
        <label className="pe-money">
          <span aria-hidden="true">₹</span>
          <input
            className={`field${b.custom ? ' mine' : ''}`}
            inputMode="numeric"
            aria-label={`Your budget for ${b.name}`}
            value={text}
            onChange={(e) => setText(e.target.value.replace(/[^\d,.]/g, ''))}
            onBlur={commit}
            onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget as HTMLInputElement).blur()}
          />
        </label>
        {b.custom ? (
          <button className="link" onClick={() => onSetLimit(b.id, null)} title={`Go back to Galla’s suggestion (${inr(b.suggested)})`}>
            Use suggestion
          </button>
        ) : (
          <span className="bl-hint">Suggested</span>
        )}
        {error && (
          <span className="pe-err" role="alert">
            {error}
          </span>
        )}
      </span>
      <div className={`meter ${tone}`} role="cell" title={`${last}: ${Math.round(ratio * 100)}% of the budget`}>
        <i style={{ width: `${Math.min(100, ratio * 100).toFixed(0)}%` }} />
      </div>
    </div>
  );
}
