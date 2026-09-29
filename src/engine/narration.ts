/* Narration decoding: payment rail and payee. */
import type { Direction, Rail } from './types';

export function detectRail(narration: string): Rail {
  const u = narration.toUpperCase();
  if (/(^|[^A-Z])UPI([^A-Z]|$)/.test(u)) return 'UPI';
  if (/NEFT/.test(u)) return 'NEFT';
  if (/IMPS/.test(u)) return 'IMPS';
  if (/RTGS/.test(u)) return 'RTGS';
  if (/NACH|\bACH\b|\bECS\b/.test(u)) return 'NACH';
  if (/\bATM\b|\bATW\b|\bNWD\b|CASH WDL/.test(u)) return 'ATM';
  if (/CHRG|\bCHG\b|CHARGES|\bAMC\b/.test(u)) return 'Charge';
  if (/INT\.?\s?PD|INTEREST|\bINT CR/.test(u)) return 'Interest';
  if (/CASH DEP|BY CASH|\bCDM\b/.test(u)) return 'Cash';
  if (/\bCHQ\b|CHEQUE|\bCLG\b|CLEARING/.test(u)) return 'Cheque';
  if (/BILLDESK|\bBBPS\b|BILLPAY/.test(u)) return 'Bill pay';
  if (/\bPOS\b/.test(u)) return 'Card';
  return 'Other';
}

const NOISE =
  /^(UPI|NEFT|IMPS|RTGS|NACH|ACH|ECS|DR|CR|P2A|P2M|P2P|MB|IB|INB|TO|BY|FROM|TRANSFER|TRF|PAYMENT|PAYMENT FROM PH|SUCCESS|REF|NA|N\/A|BILLDESK|BBPS|CHALLAN|INDIA|PVT|LTD)$/;

export function titleCase(s: string): string {
  return s
    .toLowerCase()
    .replace(/\b([a-z])/g, (m) => m.toUpperCase())
    .replace(/\b(Upi|Gst|Emi|Atm|Ltd|Hul|Itc)\b/g, (m) => m.toUpperCase());
}

const UNNAMED: Record<Rail, string> = {
  UPI: 'Unnamed UPI payment',
  NEFT: 'Unnamed NEFT transfer',
  IMPS: 'Unnamed IMPS transfer',
  RTGS: 'Unnamed RTGS transfer',
  NACH: 'Unnamed auto-debit',
  ATM: 'ATM withdrawal',
  Charge: 'Bank charges',
  Interest: 'Bank interest',
  Cash: 'Cash deposit',
  Cheque: 'Unnamed cheque',
  'Bill pay': 'Unnamed bill payment',
  Card: 'Unnamed card payment',
  Other: 'Unnamed payment',
};

/**
 * Best guess at who the money went to or came from. Narrations with no payee ("UPI/CR/717889")
 * get one shared name per rail, so reference numbers don't turn each row into its own payee.
 */
export function extractPayee(narration: string, rail: Rail): string {
  let s = narration.toUpperCase();
  if (rail === 'ATM') return 'ATM withdrawal';
  if (rail === 'Cash') return 'Cash deposit';
  if (rail === 'Interest') return 'Bank interest';
  if (rail === 'Charge') return 'Bank charges';
  if (/\bGST\b|CPIN/.test(s)) return 'GST payment';
  if (/ADV(ANCE)? TAX|CHALLAN 280/.test(s)) return 'Advance tax';
  if (/TDS/.test(s) && /TAX|CHALLAN/.test(s)) return 'TDS payment';
  s = s.replace(/[A-Z]{4}0[A-Z0-9]{6}/g, ' '); // IFSC codes
  const parts = s
    .split(/[/|:*-]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  for (const p of parts) {
    if (p.includes('@')) continue; // VPA, used only as a fallback below
    const clean = p
      .split(/\s+/)
      .filter((w) => w.length > 1 && !/\d/.test(w) && !NOISE.test(w))
      .join(' ');
    if (clean.replace(/\s/g, '').length < 3) continue;
    return titleCase(clean.slice(0, 40));
  }
  const vpa = s.match(/([A-Z0-9._-]+)@[A-Z]+/);
  if (vpa?.[1]) return vpa[1].toLowerCase();
  return UNNAMED[rail];
}

/** Payee key used for grouping and owner overrides: lower-case letters and digits + direction. */
export function payeeKey(payee: string, dir: Direction): string {
  return payee.toLowerCase().replace(/[^a-z0-9]/g, '') + ':' + dir;
}
