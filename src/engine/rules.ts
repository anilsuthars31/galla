/* Keyword rules. A rule match is treated as certain (confidence 1.0). First match wins. */
import type { CategoryId, Direction } from './types';
import { BILLER_PATTERN } from './billers';

export interface Rule {
  pattern: RegExp;
  category: CategoryId;
  /** Only applies to money in (C) or money out (D). */
  direction: Direction;
  /** Added after the prototype (so the parity test can compare against the original rule set). */
  added?: boolean;
}

export const RULES: readonly Rule[] = [
  { pattern: /CHRG|\bCHG\b|CHARGES|SMS ALERT|MIN BAL|\bAMC\b|QR RENTAL/, category: 'charges', direction: 'D' },
  { pattern: /\bGST\b|CPIN|GSTN|\bTDS\b|INCOME TAX|CBDT|ADV(ANCE)? TAX|CHALLAN 280/, category: 'tax', direction: 'D' },
  // Electricity, water and gas boards across India (billers.ts). Before EMI, because many shops pay
  // electricity by auto-debit ("NACH DR/TATA POWER"), which the EMI rule would otherwise take.
  { pattern: BILLER_PATTERN, category: 'utilities', direction: 'D', added: true },
  { pattern: /NACH|\bACH\b|\bECS\b|\bEMI\b|LOAN|BAJAJ FIN|FINANCE LTD|LENDINGKART|CAPITAL FLOAT/, category: 'emi', direction: 'D' },
  { pattern: /\bRENT\b|LEASE/, category: 'rent', direction: 'D' },
  { pattern: /SALARY|\bSAL\b|WAGES|STAFF/, category: 'salary', direction: 'D' },
  {
    pattern: /ELECTRIC|MSEDCL|BESCOM|TPDDL|BSES|TNEB|WATER|AIRTEL|\bJIO\b|VODAFONE|\bVI\b|BSNL|BROADBAND|\bGAS\b|MAHANAGAR/,
    category: 'utilities',
    direction: 'D',
  },
  // Home/shop broadband providers.
  { pattern: /FIBERNET|FIBRENET|FIBER NET|HATHWAY|EXCITEL/, category: 'utilities', direction: 'D', added: true },
  // Internet, Wi-Fi, DTH and phone bills ("BILL/INTERNET/..."). Not "INTERNET BANKING", which is a transfer.
  {
    pattern: /INTERNET(?! ?BANK)|\bWI-?FI\b|\bDTH\b|TATA ?PLAY|TATA ?SKY|DISH ?TV|POSTPAID|\bBILL(PAY)?\b.*\b(MOBILE|PHONE|CABLE)\b|\b(MOBILE|PHONE|CABLE)\b.*\bBILL\b/,
    category: 'utilities',
    direction: 'D',
    added: true,
  },
  {
    pattern: /ZOMATO|NETFLIX|HOTSTAR|PRIME VIDEO|MYNTRA|BOOKMYSHOW|SPOTIFY|\bUBER\b|\bOLA\b|MAKEMYTRIP|NYKAA|AJIO|SWIGGY(?! ?INSTAMART)/,
    category: 'personal',
    direction: 'D',
  },
  // Amazon card/UPI purchases are treated as personal shopping (as labelled in the synthetic data).
  // A shop that buys stock on Amazon corrects this once per payee in the ledger.
  { pattern: /\bAMAZON\b(?! ?PAY BILL)/, category: 'personal', direction: 'D', added: true },
  {
    pattern:
      /TRADERS|DISTRIBUT|WHOLESALE|ENTERPRISE|AGENC|SUPPL|STOCK|UNILEVER|\bHUL\b|\bITC\b|NESTLE|DABUR|UDAAN|JUMBOTAIL|METRO CASH|CASH AND CARRY|MART\b/,
    category: 'suppliers',
    direction: 'D',
  },
  // ATM cash is "other", not "personal": kirana owners often pay suppliers in cash.
  { pattern: /\bATM\b|\bATW\b|\bNWD\b|CASH WDL/, category: 'other', direction: 'D' },
  // Refunds and reversals received (including refunded bank charges) are other income.
  { pattern: /INT\.?\s?PD|INTEREST|REFUND|REVERSAL|\bREV\b|CASHBACK/, category: 'other_income', direction: 'C' },
  {
    pattern: /SETTLEMENT|PAYTM|BHARATPE|PHONEPE|RAZORPAY|PINE ?LABS|CASH DEP|BY CASH|\bCDM\b|\bUPI\b|\bPOS\b/,
    category: 'sales',
    direction: 'C',
  },
];

/** Category from the first matching rule, or null when no rule applies. */
export function ruleCategory(narration: string, dir: Direction, rules: readonly Rule[] = RULES): CategoryId | null {
  const u = narration.toUpperCase();
  for (const r of rules) if (r.direction === dir && r.pattern.test(u)) return r.category;
  return null;
}
