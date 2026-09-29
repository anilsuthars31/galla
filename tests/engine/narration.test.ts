import { describe, expect, it } from 'vitest';
import { detectRail, extractPayee, payeeKey, titleCase } from '../../src/engine/narration';
import { NARRATIONS } from '../fixtures/narrations';

describe('detectRail', () => {
  it.each([
    ['UPI/CR/123/X', 'UPI'],
    ['NEFT CR-YESB0000001-X', 'NEFT'],
    ['IMPS/P2A/123/X', 'IMPS'],
    ['RTGS-HDFCR52026-X', 'RTGS'],
    ['NACH DR/BAJAJ FINANCE LTD', 'NACH'],
    ['ACH/BAJAJ FINANCE', 'NACH'],
    ['ATM WDL/ATM SBI', 'ATM'],
    ['NWD-123-SBI', 'ATM'],
    ['CHRG:QR RENTAL', 'Charge'],
    ['INT.PD:01-04-2026', 'Interest'],
    ['BY CASH DEPOSIT-CDM', 'Cash'],
    ['CHQ DEP 123456', 'Cheque'],
    ['BILLDESK/MSEDCL', 'Bill pay'],
    ['POS 4160 METRO', 'Card'],
    ['SOMETHING ELSE', 'Other'],
  ] as const)('%s -> %s', (n, rail) => {
    expect(detectRail(n)).toBe(rail);
  });

  it('does not see UPI inside other words', () => {
    expect(detectRail('GUPIL TRADERS')).toBe('Other');
  });
});

describe('extractPayee', () => {
  it.each([
    ['UPI/CR/610112345678/PRIYA DESHMUKH/priyad@oksbi/Payment from Ph', 'Priya Deshmukh'],
    ['IMPS/P2A/123/RAMESH GUPTA/SBIN0011234/Shop rent', 'Ramesh Gupta'],
    ['NEFT DR-HDFC0001432-SHREE GANESH DISTRIBUTORS-N123', 'Shree Ganesh Distributors'],
    ['NACH DR/BAJAJ FINANCE LTD/ACH-DR-45011234', 'Bajaj Finance'],
    ['UPI/DR/1/AIRTEL/airtelbroadband@paytm/Broadband', 'Airtel'],
    ['UPI/DR/1/UNILEVER HUL/hul@okicici', 'Unilever HUL'],
  ])('%s -> %s', (n, payee) => {
    expect(extractPayee(n, detectRail(n))).toBe(payee);
  });

  it('falls back to the VPA handle when there is no name', () => {
    expect(extractPayee('UPI/abc123@oksbi', 'UPI')).toBe('abc123');
  });

  it('gives narrations with no payee one shared name per rail (reference numbers ignored)', () => {
    const a = extractPayee('UPI/CR/717889', 'UPI');
    const b = extractPayee('UPI/CR/262924', 'UPI');
    expect(a).toBe('Unnamed UPI payment');
    expect(b).toBe(a);
    expect(extractPayee('12345/67890', 'Other')).toBe('Unnamed payment');
  });

  it('keeps POS SETTLE as a readable name', () => {
    expect(extractPayee('POS SETTLE', 'Card')).toBe('Pos Settle');
    expect(extractPayee('POS SETTLEMENT 12345', 'Card')).toBe('Pos Settlement');
  });

  it('names tax and bank rows', () => {
    expect(extractPayee('GST PAYMENT CPIN 1/GSTN', 'Other')).toBe('GST payment');
    expect(extractPayee('TDS CHALLAN 281', 'Other')).toBe('TDS payment');
    expect(extractPayee('ATM WDL', 'ATM')).toBe('ATM withdrawal');
  });
});

describe('payee key and title case', () => {
  it('keys by letters and digits plus direction', () => {
    expect(payeeKey('Shree Ganesh Distributors', 'D')).toBe('shreeganeshdistributors:D');
    expect(payeeKey('ramesh', 'C')).not.toBe(payeeKey('ramesh', 'D'));
  });

  it('title-cases with known acronyms', () => {
    expect(titleCase('GST PAYMENT VIA UPI')).toBe('GST Payment Via UPI');
  });
});

describe('bank narration fixtures', () => {
  for (const [bank, cases] of Object.entries(NARRATIONS)) {
    it.each(cases)(`${bank}: %s`, (n, _dir, rail, payee) => {
      expect(detectRail(n)).toBe(rail);
      expect(extractPayee(n, rail)).toBe(payee);
    });
  }
});
