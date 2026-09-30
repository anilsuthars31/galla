import { inr, monthShort, type Analysis } from '../../engine';
import { catColor } from '../theme';

export function BudgetTable({ analysis: a }: { analysis: Analysis }) {
  const month = monthShort(a.budgetMonth);
  const over = a.budget.filter((b) => b.status === 'over').length;
  return (
    <div className="panel">
      <div className="phead">
        <div>
          <h2>Monthly budget</h2>
          <p>Suggested limit = your typical month, never below fixed payments. Compared with {month}.</p>
        </div>
        {over > 0 ? <span className="pill critical">{over} over</span> : <span className="pill good">All on track</span>}
      </div>
      <div className="blist" role="table" aria-label="Monthly budget">
        <div className="bhead" role="row">
          <span role="columnheader">Category</span>
          <span role="columnheader" className="r">
            Limit
          </span>
          <span role="columnheader" className="r">
            {month} actual
          </span>
          <span role="columnheader" />
          <span role="columnheader">Status</span>
        </div>
        {a.budget.map((b) => {
          const ratio = b.limit ? b.actual / b.limit : b.actual ? 1 : 0;
          const tone = b.status === 'over' ? 'over' : ratio > 1 ? 'near' : '';
          return (
            <div className="bline" role="row" key={b.id}>
              <span className="catname" role="cell">
                <span className="sw" style={{ background: catColor(b.id) }} />
                <span>{b.name}</span>
              </span>
              <span className="bnums">
                <span className="r num" role="cell">
                  <span className="bl-label">Limit</span>
                  {inr(b.limit)}
                </span>
                <span className="r num" role="cell">
                  <span className="bl-label">{month}</span>
                  {inr(b.actual)}
                </span>
              </span>
              <div className={`meter ${tone}`} role="cell" title={`${Math.round(ratio * 100)}% of the limit`}>
                <i style={{ width: `${Math.min(100, ratio * 100).toFixed(0)}%` }} />
              </div>
              <span className="bstatus" role="cell">
                {b.status === 'over' ? <span className="pill critical">Over</span> : <span className="pill good">On track</span>}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
