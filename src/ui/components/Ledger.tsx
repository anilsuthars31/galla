import { useMemo, useState, type Ref } from 'react';
import {
  CATEGORIES,
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  countCorrections,
  formatDate,
  inr,
  isCategoryId,
  monthLabel,
  monthOf,
  signedInr,
  type CategoryId,
  type MonthIndex,
  type Txn,
} from '../../engine';
import { catColor } from '../theme';
import { Icon } from './Icons';

export interface LedgerFilter {
  q: string;
  cat: CategoryId | '';
  month: MonthIndex | null;
  review: boolean;
}

interface Props {
  ref: Ref<HTMLElement>;
  txns: Txn[];
  filter: LedgerFilter;
  onFilter: (f: LedgerFilter) => void;
  onRecategorize: (t: Txn, c: CategoryId) => void;
  onExport: () => void;
  onReset: () => void;
  /** Number of payees the owner has re-categorized. */
  corrections: number;
  flashKey: { key: string; n: number } | null;
}

const PAGE = 25;

export function Ledger({ ref, txns, filter, onFilter, onRecategorize, onExport, onReset, corrections, flashKey }: Props) {
  const [shown, setShown] = useState(PAGE);
  const set = (f: Partial<LedgerFilter>) => {
    onFilter({ ...filter, ...f });
    setShown(PAGE);
  };

  const rows = useMemo(() => {
    const q = filter.q.trim().toLowerCase();
    return txns
      .filter(
        (t) =>
          (!filter.cat || t.category === filter.cat) &&
          (filter.month === null || monthOf(t.date) === filter.month) &&
          (!filter.review || t.source === 'review') &&
          (!q || t.narration.toLowerCase().includes(q) || t.payee.toLowerCase().includes(q)),
      )
      .reverse();
  }, [txns, filter]);

  const reviewCount = useMemo(() => txns.filter((t) => t.source === 'review').length, [txns]);
  const exportable = useMemo(() => countCorrections(txns), [txns]);
  const net = rows.reduce((s, t) => s + (t.dir === 'C' ? t.amount : -t.amount), 0);
  const visible = rows.slice(0, shown);

  return (
    <section className="panel section-enter" ref={ref} aria-label="Transactions" style={{ scrollMarginTop: 80 }}>
      <div className="phead">
        <div>
          <h2>Transactions</h2>
          <p>Change a category and every payment to that payee follows. Your choices are remembered in this browser.</p>
        </div>
        <div className="actions">
          {corrections > 0 && (
            <button className="btn ghost sm" onClick={onReset}>
              <Icon.reset />
              Undo my {corrections} change{corrections > 1 ? 's' : ''}
            </button>
          )}
          <button className="btn sm" onClick={onExport} disabled={!exportable} title="Download your category changes as a CSV for training">
            <Icon.download />
            Export corrections{exportable ? ` (${exportable})` : ''}
          </button>
        </div>
      </div>

      <div className="toolbar">
        <label className="search">
          <Icon.search />
          <span className="sr-only">Search transactions</span>
          <input className="field" type="search" placeholder="Search payee or narration" value={filter.q} onChange={(e) => set({ q: e.target.value })} />
        </label>
        <select className="field" aria-label="Filter by category" value={filter.cat} onChange={(e) => set({ cat: isCategoryId(e.target.value) ? e.target.value : '' })}>
          <option value="">All categories</option>
          <optgroup label="Money in">
            {INCOME_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORIES[c].name}
              </option>
            ))}
          </optgroup>
          <optgroup label="Money out">
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {CATEGORIES[c].name}
              </option>
            ))}
          </optgroup>
        </select>
        {reviewCount > 0 && (
          <button className={`chip${filter.review ? ' on' : ''}`} aria-pressed={filter.review} onClick={() => set({ review: !filter.review })}>
            Needs review · {reviewCount}
          </button>
        )}
        {filter.month !== null && (
          <span className="fchip">
            {monthLabel(filter.month)}
            <button aria-label="Clear month filter" onClick={() => set({ month: null })}>
              <Icon.x />
            </button>
          </span>
        )}
      </div>

      <div role="table" aria-label="Transactions" aria-rowcount={rows.length}>
        <div className="lhead" role="row">
          <span role="columnheader">Date</span>
          <span role="columnheader">Payee · narration</span>
          <span role="columnheader">Mode</span>
          <span role="columnheader">Category</span>
          <span role="columnheader" className="r">
            Amount
          </span>
        </div>
        {visible.length ? (
          visible.map((t) => (
            <Row
              key={flashKey?.key === t.key ? `${t.id}-${flashKey.n}` : t.id}
              t={t}
              flash={flashKey?.key === t.key}
              onChange={(c) => onRecategorize(t, c)}
            />
          ))
        ) : (
          <p className="empty-note" style={{ padding: '16px 8px' }}>
            No transactions match these filters.
          </p>
        )}
      </div>

      <div className="more">
        <span>
          Showing <span className="num">{visible.length.toLocaleString('en-IN')}</span> of <span className="num">{rows.length.toLocaleString('en-IN')}</span> · net{' '}
          <span className={`num ${net < 0 ? 'neg' : ''}`}>{signedInr(net)}</span>
        </span>
        <span className="grow" />
        {rows.length > shown && (
          <button className="btn sm" onClick={() => setShown((s) => s + 100)}>
            Show 100 more
          </button>
        )}
      </div>
    </section>
  );
}

function Row({ t, flash, onChange }: { t: Txn; flash: boolean; onChange: (c: CategoryId) => void }) {
  const options = t.dir === 'C' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES;
  const suggested = new Set(t.suggestions.map((s) => s.category));
  return (
    <div className={`lrow${flash ? ' flash' : ''}`} role="row">
      <span className="meta">
        <span className="date num" role="cell">
          {formatDate(t.date, false)}
        </span>
        <span className="rail" role="cell">
          {t.rail}
        </span>
      </span>
      <div className="who" role="cell">
        <b>
          <span>{t.payee}</span>
          {t.source === 'review' && <span className="tag review">Review</span>}
          {t.source === 'owner' && <span className="tag mine">Yours</span>}
        </b>
        <span title={t.narration}>{t.narration}</span>
      </div>
      <label className={`catsel${t.source === 'owner' ? ' mine' : t.source === 'review' ? ' review' : ''}`} role="cell">
        <span className="sw" style={{ background: catColor(t.category) }} />
        <span className="sr-only">Category for {t.payee}</span>
        <select className="field" value={t.category} onChange={(e) => isCategoryId(e.target.value) && onChange(e.target.value)}>
          {t.suggestions.length > 0 && (
            <optgroup label="Suggested">
              {t.suggestions.map((s) => (
                <option key={s.category} value={s.category}>
                  {CATEGORIES[s.category].name} · {Math.round(s.probability * 100)}%
                </option>
              ))}
            </optgroup>
          )}
          {options
            .filter((c) => !suggested.has(c))
            .map((c) => (
              <option key={c} value={c}>
                {CATEGORIES[c].name}
              </option>
            ))}
        </select>
      </label>
      <span className={`amt num${t.dir === 'C' ? ' c' : ''}`} role="cell">
        {t.dir === 'C' ? '+' : '−'}
        {inr(t.amount)}
      </span>
    </div>
  );
}
