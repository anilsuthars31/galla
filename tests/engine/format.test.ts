import { describe, expect, it } from 'vitest';
import { formatDate, inr, inrShort, signedInr } from '../../src/engine/format';
import { daysInMonth, dayOfWeek, monthLabel, monthOf } from '../../src/engine/months';

describe('Indian money format', () => {
  it.each([
    [123456, '₹1,23,456'],
    [12345678.9, '₹1,23,45,679'],
    [999, '₹999'],
    [0, '₹0'],
    [-0.4, '₹0'],
    [-185000, '−₹1,85,000'],
  ])('inr(%s) = %s', (n, s) => expect(inr(n)).toBe(s));

  it.each([
    [185000, '₹1.85L'],
    [1250000, '₹12.5L'],
    [12400, '₹12.4k'],
    [850, '₹850'],
    [12000000, '₹1.20Cr'],
    [-185000, '−₹1.85L'],
  ])('inrShort(%s) = %s', (n, s) => expect(inrShort(n)).toBe(s));

  it('signs', () => {
    expect(signedInr(1500)).toBe('+₹1,500');
    expect(signedInr(-1500)).toBe('−₹1,500');
  });
});

describe('dates and months', () => {
  it('formats dates', () => {
    expect(formatDate('2026-04-05')).toBe('05 Apr 2026');
    expect(formatDate('2026-09-30', false)).toBe('30 Sep');
  });

  it('month helpers', () => {
    const m = monthOf('2026-09-15');
    expect(monthLabel(m)).toBe('Sep 2026');
    expect(monthLabel(m, true)).toBe('September 2026');
    expect(monthLabel(m + 4)).toBe('Jan 2027');
    expect(daysInMonth(monthOf('2028-02-01'))).toBe(29);
    expect(dayOfWeek('2026-04-06')).toBe(1); // a Monday
  });
});
