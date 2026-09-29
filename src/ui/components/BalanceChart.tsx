import { useId, useState } from 'react';
import { inr, inrShort, monthLabel, monthShort, signedInr, type Analysis } from '../../engine';
import type { MonthView } from '../model';
import { niceStep, smoothPath } from '../chart';
import { useWidth } from '../useWidth';

const H = 270;
const L = 62;
const R = 16;
const T = 20;
const B = 34;

interface Point {
  i: number;
  month: number;
  v: number;
  forecast: boolean;
}

export function BalanceChart({ analysis: a, months }: { analysis: Analysis; months: MonthView[] }) {
  return (
    <div className="panel section-enter">
      <div className="phead">
        <div>
          <h2>{a.hasBalance ? 'Projected bank balance' : 'Projected cash flow'}</h2>
          <p>
            {a.hasBalance ? 'Month-end balance. The dashed line is the forecast. ' : 'This file has no balance column, so the chart shows net cash flow per month. '}
            Income is taken at the lower of the recent and long-run average.
          </p>
        </div>
      </div>
      {a.hasBalance ? <BalanceLine analysis={a} months={months} /> : <NetFlowBars months={months} />}
      <div className="tscroll">
        <table className="ftable">
          <thead>
            <tr>
              <th>Month</th>
              <th>Money in</th>
              <th>Money out</th>
              <th>Net</th>
              {a.hasBalance && <th>Closing</th>}
            </tr>
          </thead>
          <tbody>
            {a.forecast.map((f) => (
              <tr key={f.month}>
                <td>{monthLabel(f.month)}</td>
                <td className="num">{inr(f.inflow)}</td>
                <td className="num">{inr(f.outflow)}</td>
                <td className={`num ${f.net < 0 ? 'neg' : ''}`}>{signedInr(f.net)}</td>
                {a.hasBalance && <td className="num">{inr(f.endBalance ?? 0)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BalanceLine({ analysis: a, months }: { analysis: Analysis; months: MonthView[] }) {
  const gid = 'b' + useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const [box, width] = useWidth<HTMLDivElement>(720);
  const W = Math.max(300, width);
  const [hover, setHover] = useState<number | null>(null);
  const pts: Point[] = months
    .filter((m) => m.endBalance !== null)
    .map((m, i) => ({ i, month: m.month, v: m.endBalance!, forecast: m.forecast }));
  if (!pts.length) return null;

  const buffer = a.fixedMonthly;
  let lo = Math.min(...pts.map((p) => p.v), buffer || Infinity);
  let hi = Math.max(...pts.map((p) => p.v));
  const span = hi - lo || Math.abs(hi) || 1;
  lo = lo >= 0 ? Math.max(0, lo - span * 0.25) : lo - span * 0.15;
  hi += span * 0.12;
  const step = niceStep((hi - lo) / 4);
  lo = Math.floor(lo / step) * step;
  hi = Math.ceil(hi / step) * step;
  const x = (i: number) => L + (W - L - R) * (pts.length === 1 ? 0.5 : i / (pts.length - 1));
  const y = (v: number) => T + (H - T - B) * (1 - (v - lo) / (hi - lo));
  const ticks: number[] = [];
  for (let v = lo; v <= hi + step / 2; v += step) ticks.push(v);

  const k = pts.findIndex((p) => p.forecast);
  const lastActual = k < 0 ? pts.length - 1 : k - 1;
  const actual = pts.slice(0, lastActual + 1).map((p) => ({ x: x(p.i), y: y(p.v) }));
  const future = pts.slice(Math.max(0, lastActual)).map((p) => ({ x: x(p.i), y: y(p.v) }));
  const base = y(Math.max(lo, 0));
  const area = actual.length > 1 ? `${smoothPath(actual)}L${actual[actual.length - 1]!.x},${base}L${actual[0]!.x},${base}Z` : '';
  const zoneX = k > 0 ? (x(lastActual) + x(k)) / 2 : null;
  const colW = (W - L - R) / Math.max(1, pts.length - 1);
  const hp = hover !== null ? pts[hover] : undefined;

  return (
    <div className="chart" ref={box} onPointerLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Month-end bank balance, actual and projected">
        <defs>
          <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="var(--s1)" stopOpacity="0.28" />
            <stop offset="1" stopColor="var(--s1)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {zoneX !== null && (
          <>
            <rect x={zoneX} y={T} width={W - R - zoneX} height={H - T - B} rx="10" fill="var(--panel-2)" />
            <text x={W - R - 10} y={T + 16} textAnchor="end" fontSize="10" letterSpacing="1.4" fontFamily="var(--f-mono)" fill="var(--faint)">
              FORECAST
            </text>
          </>
        )}
        {ticks.map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeWidth="1" strokeDasharray={v === 0 ? undefined : '2 4'} />
            <text x={L - 10} y={y(v) + 4} textAnchor="end" fontSize="11" fontFamily="var(--f-mono)" fill="var(--faint)">
              {inrShort(v)}
            </text>
          </g>
        ))}
        {buffer > lo && buffer < hi && (
          <g>
            <line x1={L} x2={W - R} y1={y(buffer)} y2={y(buffer)} stroke="var(--warn)" strokeWidth="1.5" strokeDasharray="4 5" />
            <text x={L + 8} y={y(buffer) - 7} fontSize="11" fontWeight="600" fill="var(--warn)">
              {W < 500 ? 'Fixed costs' : 'One month of fixed payments'} · {inrShort(buffer)}
            </text>
          </g>
        )}
        {area && <path d={area} fill={`url(#${gid})`} />}
        <path d={smoothPath(actual)} fill="none" stroke="var(--s1)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        {future.length > 1 && <path d={smoothPath(future)} fill="none" stroke="var(--s1)" strokeWidth="2.5" strokeDasharray="7 6" strokeLinecap="round" />}
        {hp && <line x1={x(hp.i)} x2={x(hp.i)} y1={T} y2={H - B} stroke="var(--line-strong)" strokeWidth="1" />}
        {pts.map((p) => (
          <circle
            key={p.i}
            cx={x(p.i)}
            cy={y(p.v)}
            r={hover === p.i ? 6 : 4.2}
            fill={p.forecast ? 'var(--panel)' : 'var(--s1)'}
            stroke={p.v < 0 ? 'var(--crit)' : 'var(--s1)'}
            strokeWidth="2.2"
            style={{ transition: 'r .2s' }}
          />
        ))}
        {pts.map((p) => (
          <text key={p.i} x={x(p.i)} y={H - 10} textAnchor="middle" fontSize="11" fontFamily="var(--f-mono)" fill={p.forecast ? 'var(--faint)' : 'var(--muted)'}>
            {monthShort(p.month)}
          </text>
        ))}
        {pts.map((p) => (
          <rect key={p.i} x={x(p.i) - colW / 2} y={T} width={colW} height={H - T - B} fill="transparent" onPointerEnter={() => setHover(p.i)} />
        ))}
      </svg>
      {hp && (
        <div
          className="tip"
          style={{
            left: `clamp(0px, calc(${((x(hp.i) / W) * 100).toFixed(2)}% - 90px), calc(100% - 180px))`,
            top: `calc(${((y(hp.v) / H) * 100).toFixed(2)}% - 76px)`,
          }}
        >
          <span className="eyebrow">{hp.forecast ? 'Forecast' : 'Month end'}</span>
          <b>{monthLabel(hp.month, true)}</b>
          <span className={`num big ${hp.v < 0 ? 'neg' : ''}`}>{inr(hp.v)}</span>
        </div>
      )}
    </div>
  );
}

function NetFlowBars({ months }: { months: MonthView[] }) {
  const [box, width] = useWidth<HTMLDivElement>(720);
  const W = Math.max(300, width);
  const nets = months.map((m) => m.inflow - m.outflow);
  const max = Math.max(1, ...nets.map(Math.abs));
  const mid = T + (H - T - B) / 2;
  const bw = (W - L - R) / months.length;
  return (
    <div className="chart" ref={box}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Net cash flow per month, actual and forecast">
        <line x1={L} x2={W - R} y1={mid} y2={mid} stroke="var(--line-strong)" />
        <text x={L - 10} y={mid + 4} textAnchor="end" fontSize="11" fontFamily="var(--f-mono)" fill="var(--faint)">
          ₹0
        </text>
        {months.map((m, i) => {
          const v = nets[i]!;
          const h = (Math.abs(v) / max) * ((H - T - B) / 2 - 8);
          const cx = L + bw * i + bw / 2;
          return (
            <g key={m.month}>
              <rect
                x={cx - bw * 0.28}
                width={bw * 0.56}
                y={v >= 0 ? mid - h : mid}
                height={Math.max(2, h)}
                rx="5"
                fill={v >= 0 ? 'var(--good)' : 'var(--crit)'}
                opacity={m.forecast ? 0.4 : 0.9}
              />
              <text x={cx} y={v >= 0 ? mid - h - 7 : mid + h + 15} textAnchor="middle" fontSize="10.5" fontFamily="var(--f-mono)" fill="var(--muted)">
                {inrShort(v)}
              </text>
              <text x={cx} y={H - 10} textAnchor="middle" fontSize="11" fontFamily="var(--f-mono)" fill={m.forecast ? 'var(--faint)' : 'var(--muted)'}>
                {monthShort(m.month)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
