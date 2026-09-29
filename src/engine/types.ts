/* Shared engine types. Category ids are fixed by CLAUDE.md: do not rename. */

export const INCOME_CATEGORIES = ['sales', 'other_income'] as const;
export const EXPENSE_CATEGORIES = [
  'suppliers',
  'salary',
  'rent',
  'utilities',
  'emi',
  'tax',
  'personal',
  'charges',
  'other',
] as const;

export type IncomeCategory = (typeof INCOME_CATEGORIES)[number];
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];
export type CategoryId = IncomeCategory | ExpenseCategory;

export interface CategoryInfo {
  id: CategoryId;
  name: string;
  kind: 'income' | 'expense';
}

export const CATEGORIES: Record<CategoryId, CategoryInfo> = {
  sales: { id: 'sales', name: 'Sales', kind: 'income' },
  other_income: { id: 'other_income', name: 'Other income', kind: 'income' },
  suppliers: { id: 'suppliers', name: 'Suppliers & stock', kind: 'expense' },
  salary: { id: 'salary', name: 'Salaries', kind: 'expense' },
  rent: { id: 'rent', name: 'Rent', kind: 'expense' },
  utilities: { id: 'utilities', name: 'Utilities', kind: 'expense' },
  emi: { id: 'emi', name: 'EMI & loans', kind: 'expense' },
  tax: { id: 'tax', name: 'GST & tax', kind: 'expense' },
  personal: { id: 'personal', name: 'Personal', kind: 'expense' },
  charges: { id: 'charges', name: 'Bank charges', kind: 'expense' },
  other: { id: 'other', name: 'Other / cash', kind: 'expense' },
};

export const ALL_CATEGORIES: readonly CategoryId[] = [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES];

export function isCategoryId(v: unknown): v is CategoryId {
  return typeof v === 'string' && v in CATEGORIES;
}

export function isIncomeCategory(c: CategoryId): c is IncomeCategory {
  return CATEGORIES[c].kind === 'income';
}

/** C = money in (deposit), D = money out (withdrawal). */
export type Direction = 'C' | 'D';

export type Rail =
  | 'UPI'
  | 'NEFT'
  | 'IMPS'
  | 'RTGS'
  | 'NACH'
  | 'ATM'
  | 'Charge'
  | 'Interest'
  | 'Cash'
  | 'Cheque'
  | 'Bill pay'
  | 'Card'
  | 'Other';

/** One cell of a spreadsheet or CSV row, as read from the file. */
export type Cell = string | number | boolean | Date | null | undefined;

/** A transaction exactly as parsed from the statement. */
export interface RawTxn {
  /** ISO YYYY-MM-DD */
  date: string;
  narration: string;
  /** Positive, 0 when this is a deposit. */
  withdrawal: number;
  /** Positive, 0 when this is a withdrawal. */
  deposit: number;
  /** Running balance after this row, or null when the file has no balance column. */
  balance: number | null;
  /** Position in the file, used to keep same-day rows in statement order. */
  order: number;
}

/** Where a transaction's category came from. `review` = nothing was confident, shown as "needs review". */
export type CategorySource = 'owner' | 'rule' | 'model' | 'review';

export interface Suggestion {
  category: CategoryId;
  probability: number;
}

export interface Categorization {
  category: CategoryId;
  source: CategorySource;
  /** 1 for owner and rule, the model probability for model, 0 for review. */
  confidence: number;
  /** Top suggestions from the model when the row needs review (empty without a model). */
  suggestions: Suggestion[];
}

/** Features the V3 classifier sees. Mirrors ml/features.py. */
export interface ClassifierInput {
  narration: string;
  dir: Direction;
  amount: number;
  /** Day of month, 1-31. */
  day: number;
  rail: Rail;
}

/**
 * Hook for the V3 model (src/engine/classifier.ts). Returns every class with its probability,
 * sorted from most to least likely. Must be pure and deterministic.
 */
export interface Classifier {
  predict(input: ClassifierInput): Suggestion[];
}

export interface Txn extends RawTxn, Categorization {
  /** Index after sorting by date; stable for a given statement. */
  id: number;
  dir: Direction;
  amount: number;
  rail: Rail;
  payee: string;
  /** Per-payee, per-direction key. Owner overrides are stored against this. */
  key: string;
}

/** Owner category corrections: payee key -> category. */
export type Overrides = Record<string, CategoryId>;

/** year * 12 + zero-based month. Plain integers keep month arithmetic simple. */
export type MonthIndex = number;

export type CategoryAmounts = Partial<Record<CategoryId, number>>;

export interface MonthSummary {
  month: MonthIndex;
  inflow: number;
  outflow: number;
  byCategory: CategoryAmounts;
  count: number;
  /** Balance after the last transaction of the month, when the file has balances. */
  endBalance: number | null;
  /** The statement covers too little of this month to use it in averages. */
  partial: boolean;
}

export interface Recurring {
  key: string;
  payee: string;
  category: CategoryId;
  frequency: 'monthly' | 'quarterly';
  /** Typical (median) amount per payment. */
  amount: number;
  /** Average spend per month for monthly items; 0 for quarterly. */
  perMonth: number;
  /** Typical day of month. */
  day: number;
  count: number;
  txnIds: number[];
  /** First month seen. */
  since: MonthIndex;
  /** Number of distinct months with a payment. */
  months: number;
  /** Month of the next expected payment. */
  next: MonthIndex;
}

export interface ForecastMonth {
  month: MonthIndex;
  inflow: number;
  outflow: number;
  net: number;
  byCategory: CategoryAmounts;
  endBalance: number | null;
  /** Quarterly payments that fall due in this month. */
  dueQuarterly: Recurring[];
}

export interface BudgetLine {
  id: ExpenseCategory;
  name: string;
  limit: number;
  actual: number;
  average: number;
  total: number;
  status: 'ok' | 'over';
  /** Monthly amounts over the months used for averages. */
  trend: number[];
}

export type AlertLevel = 'critical' | 'warning' | 'good' | 'info';

export interface Alert {
  level: AlertLevel;
  title: string;
  body: string;
}

export interface Analysis {
  /** Every calendar month in the statement, oldest first. */
  months: MonthSummary[];
  /** Months used for averages (full months; all months if none are full). */
  basisMonths: MonthIndex[];
  forecast: ForecastMonth[];
  recurring: Recurring[];
  budget: BudgetLine[];
  /** The month the budget "actual" column refers to. */
  budgetMonth: MonthIndex;
  alerts: Alert[];
  currentBalance: number | null;
  hasBalance: boolean;
  /** Sum of monthly recurring payments. */
  fixedMonthly: number;
  avgInflow: number;
  avgOutflow: number;
  period: { from: string; to: string };
}
