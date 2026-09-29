/* 2D stacked bars: the same picture as the 3D towers, used when WebGL is unavailable. */
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, inrShort, monthShort, type ExpenseCategory, type MonthIndex } from '../../engine';
import type { MonthView } from '../model';
import { catColor } from '../theme';
import { useWidth } from '../useWidth';

const H = 300;
const T = 16;
const B = 34;

interface Props {
  months: MonthView[];
  selected: MonthIndex;
  onSelect: (m: MonthIndex) => void;
  hidden: ReadonlySet<ExpenseCategory>;
}

export function Bars2D({ months, selected, onSelect, hidden }: Props) {
  const [box, width] = useWidth<HTMLDivElement>(720);
  const W = Math.max(300, width);
  const max = Math.max(1, ...months.map((m) => Math.max(m.inflow, m.outflow)));
  const colW = W / months.length;
  const bw = Math.min(26, colW * 0.3);
  const y = (v: number) => ((H - T - B) * v) / max;

  return (
    <div className="bars2d" ref={box}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Money in and out per month, stacked by category">
        {months.map((m, i) => {
          const cx = colW * i + colW / 2;
          let accIn = H - B;
          let accOut = H - B;
          const sel = m.month === selected;
          return (
            <g key={m.month} onClick={() => onSelect(m.month)} style={{ cursor: 'pointer' }} opacity={m.forecast ? 0.5 : 1}>
              <rect x={colW * i + 3} y={T - 6} width={colW - 6} height={H - T - B + 12} rx="12" fill={sel ? 'var(--panel-2)' : 'transparent'} />
              {INCOME_CATEGORIES.map((c) => {
                const h = y(m.byCategory[c] ?? 0);
                accIn -= h;
                return h > 0 ? <rect key={c} x={cx - bw - 2} y={accIn} width={bw} height={h} rx="3" fill={catColor(c)} /> : null;
              })}
              {EXPENSE_CATEGORIES.map((c) => {
                if (hidden.has(c)) return null;
                const h = y(m.byCategory[c] ?? 0);
                accOut -= h;
                return h > 0 ? <rect key={c} x={cx + 2} y={accOut} width={bw} height={h} rx="3" fill={catColor(c)} /> : null;
              })}
              <text x={cx} y={H - 12} textAnchor="middle" fontSize="11" fontFamily="var(--f-mono)" fontWeight={sel ? 700 : 500} fill={sel ? 'var(--ink)' : 'var(--muted)'}>
                {monthShort(m.month)}
              </text>
              <title>{`${monthShort(m.month)}${m.forecast ? ' (forecast)' : ''}: in ${inrShort(m.inflow)}, out ${inrShort(m.outflow)}`}</title>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
