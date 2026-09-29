/* Calendar helpers on ISO date strings and month indexes. No time zones involved. */
import type { MonthIndex } from './types';

export const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;
export const MONTH_LONG = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

const pad = (n: number) => String(n).padStart(2, '0');

/** Month is 1-based here, as written in dates. */
export function toIso(year: number, month: number, day: number): string {
  return `${year}-${pad(month)}-${pad(day)}`;
}

export function isValidYmd(year: number, month: number, day: number): boolean {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (year < 1900 || year > 2200 || month < 1 || month > 12 || day < 1) return false;
  return day <= daysInMonth(year * 12 + month - 1);
}

export function monthOf(iso: string): MonthIndex {
  return Number(iso.slice(0, 4)) * 12 + Number(iso.slice(5, 7)) - 1;
}

export function dayOf(iso: string): number {
  return Number(iso.slice(8, 10));
}

export function yearOf(m: MonthIndex): number {
  return Math.floor(m / 12);
}

export function daysInMonth(m: MonthIndex): number {
  return new Date(Date.UTC(yearOf(m), (m % 12) + 1, 0)).getUTCDate();
}

/** 0 = Sunday. */
export function dayOfWeek(iso: string): number {
  return new Date(Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, dayOf(iso))).getUTCDay();
}

/** "Apr 2026", or "April 2026" when long. */
export function monthLabel(m: MonthIndex, long = false): string {
  const names = long ? MONTH_LONG : MONTH_SHORT;
  return `${names[m % 12]} ${yearOf(m)}`;
}

/** "Apr" */
export function monthShort(m: MonthIndex): string {
  return MONTH_SHORT[m % 12] ?? '';
}
