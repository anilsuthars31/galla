/* The business profile an owner fills in at setup. Shared by the web app and the API (server/ imports
   this file), so both sides validate against the same lists. Constants and types only. */
import type { ExpenseCategory } from './types';

export const BUSINESS_TYPES = {
  kirana: 'Kirana / general store',
  restaurant: 'Restaurant / food',
  pharmacy: 'Medical / pharmacy',
  salon: 'Salon / beauty',
  clothing: 'Clothing / textiles',
  hardware: 'Hardware / electrical',
  other: 'Other',
} as const;
export type BusinessType = keyof typeof BUSINESS_TYPES;
export const BUSINESS_TYPE_IDS = Object.keys(BUSINESS_TYPES) as BusinessType[];

/** Who a regular payee is. Each role maps to exactly one expense category. */
export const PAYEE_ROLES = {
  employee: { label: 'Employee', category: 'salary' },
  landlord: { label: 'Landlord', category: 'rent' },
  supplier: { label: 'Supplier', category: 'suppliers' },
  lender: { label: 'Loan / EMI', category: 'emi' },
  utility: { label: 'Utility', category: 'utilities' },
} as const satisfies Record<string, { label: string; category: ExpenseCategory }>;
export type PayeeRole = keyof typeof PAYEE_ROLES;
export const PAYEE_ROLE_IDS = Object.keys(PAYEE_ROLES) as PayeeRole[];

export interface BusinessProfile {
  name: string;
  type: BusinessType;
  city: string | null;
  employeeCount: number;
  /** True once the owner finished (or skipped through) the setup steps. */
  setupComplete: boolean;
}

export interface PayeeRule {
  id: string;
  role: PayeeRole;
  /** As the owner writes it, e.g. "Suresh Pawar". */
  name: string;
  /** Typical amount in whole rupees, if known. */
  amount: number | null;
  /** Typical day of the month it is paid, if known. */
  day: number | null;
  /** Other ways it appears in statements, e.g. a UPI id "suresh.p@okaxis". */
  aliases: string[];
}

export type PayeeInput = Omit<PayeeRule, 'id'>;

/** Limits shared by the setup form and the API. */
export const LIMITS = {
  nameMax: 80,
  cityMax: 60,
  employeesMax: 500,
  amountMax: 10_00_00_000, // ₹10 crore
  aliasesMax: 5,
  payeesMax: 300,
} as const;
