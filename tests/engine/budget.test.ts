import { describe, expect, it } from 'vitest';
import { buildBudget } from '../../src/engine/budget';
import type { MonthSummary, Recurring } from '../../src/engine/types';

const m = (month: number, byCategory: MonthSummary['byCategory']): MonthSummary => ({
  month,
  inflow: 0,
  outflow: 0,
  byCategory,
  count: 1,
  endBalance: null,
  partial: false,
});

describe('buildBudget', () => {
  it('suggests the median month rounded up to ₹500 and compares the latest month', () => {
    const [b] = buildBudget([m(1, { suppliers: 30100 }), m(2, { suppliers: 31000 }), m(3, { suppliers: 40000 })], []);
    expect(b).toMatchObject({ id: 'suppliers', name: 'Suppliers & stock', limit: 31000, actual: 40000, status: 'over', trend: [30100, 31000, 40000], total: 101100 });
  });

  it('allows 10% above the limit before calling it over', () => {
    const [b] = buildBudget([m(1, { rent: 10000 }), m(2, { rent: 10000 }), m(3, { rent: 11000 })], []);
    expect(b).toMatchObject({ limit: 10000, status: 'ok' });
  });

  it('never sets a limit below the fixed monthly payments', () => {
    const rec = { category: 'emi', frequency: 'monthly', perMonth: 18500 } as Recurring;
    const [b] = buildBudget([m(1, {}), m(2, {}), m(3, { emi: 18500 })], [rec]);
    expect(b).toMatchObject({ id: 'emi', limit: 18500, actual: 18500, status: 'ok' });
  });

  it('flags spending in a category with no usual level', () => {
    const [b] = buildBudget([m(1, {}), m(2, {}), m(3, { personal: 900 })], []);
    expect(b).toMatchObject({ limit: 0, status: 'over' });
  });

  it('leaves out categories with no spending and income categories', () => {
    expect(buildBudget([m(1, { sales: 5000 })], [])).toEqual([]);
  });

  describe('the owner’s own budget', () => {
    const basis = [m(1, { suppliers: 30000, rent: 28000 }), m(2, { suppliers: 32000, rent: 28000 }), m(3, { suppliers: 40000, rent: 28000 })];

    it('starts from the suggestion; an own amount replaces it and keeps the suggestion visible', () => {
      const [rent, sup] = [...buildBudget(basis, [], { suppliers: 45000 })].sort((a, b) => a.id.localeCompare(b.id));
      expect(rent).toMatchObject({ id: 'rent', limit: 28000, suggested: 28000, custom: false });
      expect(sup).toMatchObject({ id: 'suppliers', limit: 45000, suggested: 32000, custom: true, status: 'ok' });
    });

    it('judges "over" against the owner’s amount', () => {
      const [sup] = buildBudget(basis, [], { suppliers: 30000 }).filter((b) => b.id === 'suppliers');
      expect(sup).toMatchObject({ limit: 30000, actual: 40000, status: 'over' });
    });

    it('₹0 is a real budget ("no personal spending")', () => {
      const [p] = buildBudget([m(1, { personal: 900 })], [], { personal: 0 });
      expect(p).toMatchObject({ limit: 0, custom: true, status: 'over' });
    });

    it('a budget for a category with no history yet is kept', () => {
      const lines = buildBudget(basis, [], { utilities: 5000 });
      expect(lines.find((b) => b.id === 'utilities')).toMatchObject({ limit: 5000, suggested: 0, custom: true, actual: 0 });
    });

    it('ignores nonsense amounts', () => {
      const [sup] = buildBudget(basis, [], { suppliers: -5 }).filter((b) => b.id === 'suppliers');
      expect(sup).toMatchObject({ limit: 32000, custom: false });
    });

    it('carries what the forecast expects next month', () => {
      const [sup] = buildBudget(basis, [], {}, { suppliers: 34000 }).filter((b) => b.id === 'suppliers');
      expect(sup!.expected).toBe(34000);
    });
  });

  it('works with one month', () => {
    expect(buildBudget([m(1, { rent: 28000 })], [])[0]).toMatchObject({ limit: 28000, actual: 28000, status: 'ok' });
  });
});
