import { useId } from 'react';
import { smoothPath, type Pt } from '../chart';

const W = 200;
const H = 54;

interface LineProps {
  values: readonly (number | null)[];
  /** Index where the forecast starts (drawn dashed). */
  forecastFrom?: number;
  color: string;
}

/** Area sparkline: actual months solid, forecast months dashed. */
export function Sparkline({ values, forecastFrom = values.length, color }: LineProps) {
  const id = 'g' + useId().replace(/[^a-zA-Z0-9_-]/g, '');
  const pts = values.map((v, i) => (v === null ? null : { i, v })).filter((p): p is { i: number; v: number } => p !== null);
  if (pts.length < 2) return null;
  const lo = Math.min(...pts.map((p) => p.v));
  const hi = Math.max(...pts.map((p) => p.v));
  const span = hi - lo || Math.abs(hi) || 1;
  const x = (i: number) => (i / (values.length - 1)) * W;
  const y = (v: number) => 8 + (H - 12) * (1 - (v - lo) / span);
  const toPt = (p: { i: number; v: number }): Pt => ({ x: x(p.i), y: y(p.v) });
  const actual = pts.filter((p) => p.i < forecastFrom).map(toPt);
  const future = pts.filter((p) => p.i >= forecastFrom - 1).map(toPt);
  const area = actual.length > 1 ? `${smoothPath(actual)}L${actual[actual.length - 1]!.x},${H}L${actual[0]!.x},${H}Z` : '';
  const last = actual[actual.length - 1];
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.28" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {area && <path d={area} fill={`url(#${id})`} />}
      <path d={smoothPath(actual)} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      {future.length > 1 && (
        <path d={smoothPath(future)} fill="none" stroke={color} strokeWidth="2" strokeDasharray="4 4" opacity="0.7" vectorEffect="non-scaling-stroke" />
      )}
      {last && <circle cx={last.x} cy={last.y} r="3" fill={color} vectorEffect="non-scaling-stroke" />}
    </svg>
  );
}

/** Small column chart for the forecast net: green above zero, red below. */
export function NetBars({ values }: { values: readonly number[] }) {
  const max = Math.max(1, ...values.map(Math.abs));
  const bw = W / values.length;
  const mid = H / 2 + 4;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" aria-hidden="true">
      <line x1="0" x2={W} y1={mid} y2={mid} stroke="var(--line-strong)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      {values.map((v, i) => {
        const h = (Math.abs(v) / max) * (H / 2 - 6);
        return (
          <rect
            key={i}
            x={i * bw + bw * 0.22}
            width={bw * 0.56}
            y={v >= 0 ? mid - h : mid}
            height={Math.max(1.5, h)}
            rx="3"
            fill={v >= 0 ? 'var(--good)' : 'var(--crit)'}
            opacity="0.85"
          />
        );
      })}
    </svg>
  );
}
