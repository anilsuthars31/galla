/* Money and date formatting in Indian style. */
import { MONTH_SHORT } from './months';

const MINUS = '−';

/** ₹1,23,456 (rounded to the rupee). */
export function inr(n: number): string {
  const r = Math.round(n);
  return (r < 0 ? MINUS : '') + '₹' + Math.abs(r).toLocaleString('en-IN');
}

/** +₹1,23,456 / −₹1,23,456 */
export function signedInr(n: number): string {
  const r = Math.round(n);
  return (r < 0 ? MINUS : '+') + '₹' + Math.abs(r).toLocaleString('en-IN');
}

/** Short form: ₹850, ₹12.4k, ₹1.85L, ₹12.5L, ₹1.2Cr */
export function inrShort(n: number): string {
  const a = Math.abs(n);
  const s = (n < 0 && Math.round(a) > 0 ? MINUS : '') + '₹';
  if (a >= 1e7) return s + (a / 1e7).toFixed(a >= 1e8 ? 1 : 2) + 'Cr';
  if (a >= 1e5) return s + (a / 1e5).toFixed(a >= 1e6 ? 1 : 2) + 'L';
  if (a >= 1e3) return s + (a / 1e3).toFixed(1) + 'k';
  return s + Math.round(a);
}

/** "05 Apr 2026", or "05 Apr" without the year. */
export function formatDate(iso: string, withYear = true): string {
  const d = iso.slice(8, 10);
  const m = MONTH_SHORT[Number(iso.slice(5, 7)) - 1] ?? '';
  return withYear ? `${d} ${m} ${iso.slice(0, 4)}` : `${d} ${m}`;
}
