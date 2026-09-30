import { describe, expect, it } from 'vitest';
import { findRecurring } from '../../src/engine/recurring';
import { monthOf } from '../../src/engine/months';
import { monthly, raw, txns } from '../helpers';

const SEP = monthOf('2026-09-01');
const RENT = 'IMPS/P2A/1/RAMESH GUPTA/SBIN0011234/Shop rent';

describe('findRecurring', () => {
  it('finds a monthly payment with a steady amount and day', () => {
    const t = txns(monthly(RENT, -28000, 5, [4, 5, 6, 7, 8, 9]));
    const [r, ...rest] = findRecurring(t, SEP);
    expect(rest).toHaveLength(0);
    expect(r).toMatchObject({
      payee: 'Ramesh Gupta',
      category: 'rent',
      frequency: 'monthly',
      amount: 28000,
      perMonth: 28000,
      day: 5,
      count: 6,
      months: 6,
      since: monthOf('2026-04-01'),
      next: monthOf('2026-10-01'),
    });
    expect(r!.txnIds).toHaveLength(6);
  });

  // Bug report 2026-09-30 (restaurant statement): rent ₹56,000 paid twice on 28 Sep made the forecast
  // assume ₹74,667 of rent every month (total ÷ months), turning the 3-month outlook negative.
  it('a one-off extra payment does not raise the monthly amount', () => {
    const rows = [...monthly('NEFT RENT/RAMESH GUPTA', -56000, 28, [7, 8, 9]), raw('2026-09-28', 'NEFT RENT/RAMESH GUPTA', -56000)];
    const [r] = findRecurring(txns(rows), SEP);
    expect(r).toMatchObject({ frequency: 'monthly', amount: 56000, count: 4, months: 3, perMonth: 56000 });
  });

  it('a varying bill paid once a month is still forecast at its average', () => {
    const t = txns(monthly('BILLDESK/MSEDCL ELECTRICITY/1', -6000, 10, [7, 8, 9], (i) => [0, 900, -300][i]!));
    const avg = t.reduce((s, x) => s + x.amount, 0) / t.length;
    expect(new Set(t.map((x) => x.amount)).size).toBe(3); // really varying
    expect(findRecurring(t, SEP)[0]!.perMonth).toBe(Math.round(avg));
  });

  it('allows some variation in amount (electricity bill)', () => {
    const t = txns(monthly('BILLDESK/MSEDCL ELECTRICITY/1', -6000, 10, [4, 5, 6, 7, 8, 9], (i) => [0, 900, -500, 300, -700, 1200][i]!));
    expect(findRecurring(t, SEP)[0]?.frequency).toBe('monthly');
  });

  it('needs at least 3 months', () => {
    expect(findRecurring(txns(monthly(RENT, -28000, 5, [8, 9])), SEP)).toEqual([]);
  });

  it('ignores a payee seen once', () => {
    expect(findRecurring(txns([raw('2026-09-05', RENT, -28000)]), SEP)).toEqual([]);
  });

  it('ignores amounts that vary too much', () => {
    const t = txns(monthly(RENT, -20000, 5, [4, 5, 6, 7, 8, 9], (i) => [0, 15000, -20000, 12000, -10000, 8000][i]!));
    expect(findRecurring(t, SEP)).toEqual([]);
  });

  it('ignores payments that stopped (not seen in the last 2 months)', () => {
    expect(findRecurring(txns(monthly(RENT, -28000, 5, [3, 4, 5, 6])), SEP)).toEqual([]);
  });

  it('ignores frequent payments (several a month)', () => {
    const rows = [4, 5, 6, 7, 8, 9].flatMap((m) =>
      [2, 9, 16, 23].map((d) => raw(`2026-0${m}-${String(d).padStart(2, '0')}`, 'UPI/DR/1/AGARWAL TRADERS/x@y/Stock', -12000)),
    );
    expect(findRecurring(txns(rows), SEP)).toEqual([]);
  });

  it('never treats ATM cash as recurring', () => {
    expect(findRecurring(txns(monthly('ATM WDL/ATM SBI/1', -10000, 9, [4, 5, 6, 7, 8, 9])), SEP)).toEqual([]);
  });

  it('never treats money in as recurring', () => {
    expect(findRecurring(txns(monthly('NEFT CR-X-BHARATPE SETTLEMENT', 50000, 1, [4, 5, 6, 7, 8, 9])), SEP)).toEqual([]);
  });

  it('finds a quarterly payment and the month it is next due', () => {
    const t = txns(monthly('CBDT ADV TAX CHALLAN 280/1', -24000, 15, [6, 9]));
    expect(findRecurring(t, SEP)).toMatchObject([{ payee: 'Advance tax', frequency: 'quarterly', amount: 24000, perMonth: 0, next: monthOf('2026-12-01') }]);
  });

  it('does not call a 2-month gap quarterly', () => {
    expect(findRecurring(txns(monthly('CBDT ADV TAX CHALLAN 280/1', -24000, 15, [7, 9])), SEP)).toEqual([]);
  });

  it('monthly does not require consecutive months (same as the prototype)', () => {
    expect(findRecurring(txns(monthly(RENT, -28000, 5, [5, 7, 9])), SEP)[0]?.frequency).toBe('monthly');
  });

  it('sorts by amount, largest first', () => {
    const t = txns([...monthly('UPI/DR/1/AIRTEL/x@paytm/Broadband', -999, 12, [4, 5, 6, 7, 8, 9]), ...monthly(RENT, -28000, 5, [4, 5, 6, 7, 8, 9])]);
    expect(findRecurring(t, SEP).map((r) => r.payee)).toEqual(['Ramesh Gupta', 'Airtel']);
  });
});
