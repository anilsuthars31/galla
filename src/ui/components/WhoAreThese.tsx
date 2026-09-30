/* "Who are these?": regular payees Galla could not sort confidently, answered with one tap each. */
import { useState } from 'react';
import { CATEGORIES, inr, PAYEE_ROLES, PAYEE_ROLE_IDS, type PayeeCandidate, type PayeeRole } from '../../engine';
import { initials } from '../model';
import { catColor } from '../theme';
import { Icon } from './Icons';

export type Answer = { role: PayeeRole } | { category: 'personal' | 'other' };

interface Props {
  candidates: PayeeCandidate[];
  onAnswer: (c: PayeeCandidate, a: Answer) => Promise<void>;
  onDismiss: (c: PayeeCandidate) => void;
}

const ordinal = (d: number) => `${d}${d % 10 === 1 && d !== 11 ? 'st' : d % 10 === 2 && d !== 12 ? 'nd' : d % 10 === 3 && d !== 13 ? 'rd' : 'th'}`;

export function WhoAreThese({ candidates, onAnswer, onDismiss }: Props) {
  const [busy, setBusy] = useState<string | null>(null);
  if (!candidates.length) return null;

  const answer = async (c: PayeeCandidate, a: Answer) => {
    setBusy(c.key);
    try {
      await onAnswer(c, a);
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="panel who" aria-label="Who are these payees?">
      <div className="phead">
        <div>
          <h2>Who are these?</h2>
          <p>
            You pay {candidates.length === 1 ? 'this payee' : `these ${candidates.length} payees`} regularly, but Galla isn’t sure what for. One tap
            each sorts every payment to them, now and in future statements.
          </p>
        </div>
      </div>
      <ul className="who-list">
        {candidates.map((c) => (
          <li key={c.key} className={busy === c.key ? 'busy-row' : undefined}>
            <div className="who-id">
              <span className="avatar" style={{ background: catColor(c.source === 'review' ? 'other' : c.category) }} aria-hidden="true">
                {initials(c.payee)}
              </span>
              <div>
                <b>{c.payee}</b>
                <span className="muted">
                  {inr(c.amount)} · around the {ordinal(c.day)} · {c.count} payments in {c.months} months
                </span>
                <span className="who-guess">
                  {c.source === 'review' ? 'Needs review' : `Galla guesses ${CATEGORIES[c.category].name}`}
                </span>
              </div>
              <button className="icon-btn ghost" aria-label={`Not now: ${c.payee}`} title="Not now" onClick={() => onDismiss(c)} disabled={busy !== null}>
                <Icon.x />
              </button>
            </div>
            <div className="who-answers" role="group" aria-label={`Who is ${c.payee}?`}>
              {PAYEE_ROLE_IDS.map((r) => (
                <button key={r} className="chip" disabled={busy !== null} onClick={() => void answer(c, { role: r })}>
                  <span className="sw" style={{ background: catColor(PAYEE_ROLES[r].category) }} />
                  {PAYEE_ROLES[r].label}
                </button>
              ))}
              <button className="chip" disabled={busy !== null} onClick={() => void answer(c, { category: 'personal' })}>
                <span className="sw" style={{ background: catColor('personal') }} />
                Personal
              </button>
              <button className="chip" disabled={busy !== null} onClick={() => void answer(c, { category: 'other' })}>
                <span className="sw" style={{ background: catColor('other') }} />
                Other
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
