import { CATEGORIES, daysInMonth, inr, monthShort, type Analysis, type Recurring } from '../../engine';
import { catColor } from '../theme';
import { initials } from '../model';

const ordinal = (d: number) => `${d}${d % 10 === 1 && d !== 11 ? 'st' : d % 10 === 2 && d !== 12 ? 'nd' : d % 10 === 3 && d !== 13 ? 'rd' : 'th'}`;
const due = (r: Recurring) => `${Math.min(r.day, daysInMonth(r.next))} ${monthShort(r.next)}`;

export function RecurringList({ analysis: a }: { analysis: Analysis }) {
  return (
    <div className="panel section-enter">
      <div className="phead">
        <div>
          <h2>Recurring payments</h2>
          <p>Same payee, similar amount, around the same date.</p>
        </div>
      </div>
      {a.recurring.length ? (
        <>
          <div className="rec-total">
            <span>Fixed every month</span>
            <span className="num">{inr(a.fixedMonthly)}</span>
          </div>
          <div className="rlist">
            {a.recurring.map((r) => (
              <div className="rline" key={r.key}>
                <span className="avatar" style={{ background: catColor(r.category) }} aria-hidden="true">
                  {initials(r.payee)}
                </span>
                <div className="who">
                  <b>{r.payee}</b>
                  <span>
                    {CATEGORIES[r.category].name} · {r.frequency === 'monthly' ? `monthly, around the ${ordinal(r.day)}` : 'every quarter'}
                  </span>
                </div>
                <div className="amt">
                  <span className="num">{inr(r.amount)}</span>
                  <span>next ~{due(r)}</span>
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <p className="empty-note">No repeating payments found yet. They show up once a payee appears in 3 or more months.</p>
      )}
    </div>
  );
}
