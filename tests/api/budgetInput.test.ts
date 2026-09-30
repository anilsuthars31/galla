import { describe, expect, it } from 'vitest';
import { parseBudget } from '../../src/ui/components/BudgetPlan';

describe('parseBudget', () => {
  it.each([
    ['45000', 45000],
    ['45,000', 45000],
    ['₹ 4,50,000', 450000],
    ['0', 0], // ₹0 is a real budget
    ['999.50', 1000],
    ['', null],
  ])('%j -> %j', (s, n) => expect(parseBudget(s)).toBe(n));

  it.each(['abc', '-500', '12.345', '1e5', '99999999999'])('%j is invalid', (s) => expect(parseBudget(s)).toBe('invalid'));
});
