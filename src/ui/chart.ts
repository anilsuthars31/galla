/* SVG helpers shared by the sparklines and the balance chart. */

export interface Pt {
  x: number;
  y: number;
}

/** Smooth path through points without overshoot (monotone cubic, Fritsch–Carlson). */
export function smoothPath(pts: readonly Pt[]): string {
  const n = pts.length;
  if (n === 0) return '';
  if (n === 1) return `M${pts[0]!.x},${pts[0]!.y}`;
  const dx: number[] = [];
  const m: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    dx.push(pts[i + 1]!.x - pts[i]!.x);
    m.push((pts[i + 1]!.y - pts[i]!.y) / (dx[i] || 1));
  }
  const t: number[] = [m[0]!];
  for (let i = 1; i < n - 1; i++) t.push(m[i - 1]! * m[i]! <= 0 ? 0 : (m[i - 1]! + m[i]!) / 2);
  t.push(m[n - 2]!);
  for (let i = 0; i < n - 1; i++) {
    if (m[i] === 0) {
      t[i] = 0;
      t[i + 1] = 0;
      continue;
    }
    const a = t[i]! / m[i]!;
    const b = t[i + 1]! / m[i]!;
    const s = a * a + b * b;
    if (s > 9) {
      const k = 3 / Math.sqrt(s);
      t[i] = k * a * m[i]!;
      t[i + 1] = k * b * m[i]!;
    }
  }
  let d = `M${pts[0]!.x.toFixed(2)},${pts[0]!.y.toFixed(2)}`;
  for (let i = 0; i < n - 1; i++) {
    const p = pts[i]!;
    const q = pts[i + 1]!;
    const h = dx[i]! / 3;
    d += `C${(p.x + h).toFixed(2)},${(p.y + t[i]! * h).toFixed(2)} ${(q.x - h).toFixed(2)},${(q.y - t[i + 1]! * h).toFixed(2)} ${q.x.toFixed(2)},${q.y.toFixed(2)}`;
  }
  return d;
}

/** A round axis step (1, 2, 2.5, 5 × 10ⁿ) near `raw`. */
export function niceStep(raw: number): number {
  const p = 10 ** Math.floor(Math.log10(raw || 1));
  const n = raw / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}
