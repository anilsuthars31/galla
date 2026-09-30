/* Money in vs money out per month: paired bars, forecast months hatched. */
import { useId, useState } from 'react';
import { inr, inrShort, monthLabel, monthShort, signedInr, type MonthIndex } from '../../engine';
import type { MonthView } from '../model';
import { niceStep } from '../chart';
import { useWidth } from '../useWidth';

const L = 52;
const R = 8;
const T = 12;
const B = 30;

interface Props {
  months: MonthView[];
  height?: number;
  selected?: MonthIndex;
  onSelect?: (m: MonthIndex) => void;
}

export function CashFlowChart({ months, height = 280, selected, onSelect }: Props) {
  const pid = 'h' + useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const [box, width] = useWidth<HTMLDivElement>(720);
  const [hover, setHover] = useState<number | null>(null);
  const W = Math.max(300, width);
  const H = height;

  const raw = Math.max(1, ...months.map((m) => Math.max(m.inflow, m.outflow)));
  const step = niceStep(raw / 4);
  const max = Math.ceil(raw / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= max + step / 2; v += step) ticks.push(v);

  const colW = (W - L - R) / months.length;
  const bw = Math.max(4, Math.min(22, colW * 0.28));
  const gap = Math.min(4, bw * 0.25);
  const y = (v: number) => T + (H - T - B) * (1 - v / max);
  const base = y(0);
  const firstForecast = months.findIndex((m) => m.forecast);
  const hm = hover !== null ? months[hover] : undefined;
  const bar = (x: number, v: number) => {
    const h = Math.max(v > 0 ? 2 : 0, base - y(v));
    const r = Math.min(5, bw / 2, h);
    // rounded top corners only
    return `M${x},${base}V${base - h + r}Q${x},${base - h} ${x + r},${base - h}H${x + bw - r}Q${x + bw},${base - h} ${x + bw},${base - h + r}V${base}Z`;
  };

  return (
    <div className="cf-chart" ref={box} onPointerLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Money in and money out per month, actual and forecast">
        <defs>
          {(['in', 'out'] as const).map((k) => (
            <pattern key={k} id={`${pid}-${k}`} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="6" height="6" fill={`var(--money-${k})`} opacity="0.22" />
              <line x1="0" y1="0" x2="0" y2="6" stroke={`var(--money-${k})`} strokeWidth="2.5" opacity="0.7" />
            </pattern>
          ))}
        </defs>

        {firstForecast > 0 && (
          <text x={L + colW * firstForecast + 4} y={T + 4} fontSize="10" fontWeight="600" letterSpacing="0.6" fill="var(--faint)">
            FORECAST
          </text>
        )}
        {ticks.map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeDasharray={v === 0 ? undefined : '3 4'} />
            <text x={L - 8} y={y(v) + 4} textAnchor="end" fontSize="11" fill="var(--faint)" className="tnum">
              {inrShort(v).replace(/\.0+(?=[kLC])/, '')}
            </text>
          </g>
        ))}

        {months.map((m, i) => {
          const cx = L + colW * i + colW / 2;
          const sel = selected === m.month;
          const on = hover === i || sel;
          return (
            <g key={m.month}>
              {on && <rect x={L + colW * i + 2} y={T} width={colW - 4} height={H - T - B} rx="8" fill="var(--hover)" />}
              <path d={bar(cx - bw - gap / 2, m.inflow)} fill={m.forecast ? `url(#${pid}-in)` : 'var(--money-in)'} />
              <path d={bar(cx + gap / 2, m.outflow)} fill={m.forecast ? `url(#${pid}-out)` : 'var(--money-out)'} />
              <text
                x={cx}
                y={H - 9}
                textAnchor="middle"
                fontSize="11"
                fontWeight={sel ? 700 : 500}
                fill={sel ? 'var(--ink)' : m.forecast ? 'var(--faint)' : 'var(--muted)'}
              >
                {monthShort(m.month)}
              </text>
              <rect
                x={L + colW * i}
                y={0}
                width={colW}
                height={H}
                fill="transparent"
                style={{ cursor: onSelect ? 'pointer' : 'default' }}
                onPointerEnter={() => setHover(i)}
                onClick={() => onSelect?.(m.month)}
              />
            </g>
          );
        })}
      </svg>

      {hm && (
        <div
          className="tip"
          style={{
            left: `clamp(0px, calc(${(((L + colW * hover! + colW / 2) / W) * 100).toFixed(2)}% - 95px), calc(100% - 190px))`,
            top: 8,
          }}
        >
          <b>
            {monthLabel(hm.month, true)}
            {hm.forecast && <span className="pill neutral">Forecast</span>}
          </b>
          <span className="row">
            <span>
              <i className="key in" />
              Money in
            </span>
            <span className="tnum">{inr(hm.inflow)}</span>
          </span>
          <span className="row">
            <span>
              <i className="key out" />
              Money out
            </span>
            <span className="tnum">{inr(hm.outflow)}</span>
          </span>
          <span className="row total">
            <span>Net</span>
            <span className={`tnum ${hm.inflow - hm.outflow < 0 ? 'neg' : 'pos'}`}>{signedInr(hm.inflow - hm.outflow)}</span>
          </span>
        </div>
      )}
    </div>
  );
}

export function ChartLegend() {
  return (
    <div className="legend-inline">
      <span>
        <i className="key in" />
        Money in
      </span>
      <span>
        <i className="key out" />
        Money out
      </span>
      <span>
        <i className="key hatch" />
        Forecast
      </span>
    </div>
  );
}
