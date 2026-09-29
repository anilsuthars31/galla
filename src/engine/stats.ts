export const sum = (a: readonly number[]): number => a.reduce((s, x) => s + x, 0);

export const mean = (a: readonly number[]): number => (a.length ? sum(a) / a.length : 0);

export function median(a: readonly number[]): number {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  const h = s.length >> 1;
  return s.length % 2 ? s[h]! : (s[h - 1]! + s[h]!) / 2;
}

/** Population standard deviation. */
export function sd(a: readonly number[]): number {
  const m = mean(a);
  return Math.sqrt(mean(a.map((x) => (x - m) ** 2)));
}
