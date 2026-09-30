import { describe, expect, it } from 'vitest';
import { buildProfileMatcher } from '../../src/engine/profileMatch';
import type { PayeeRule } from '../../src/engine/profile';

let n = 0;
const payee = (p: Partial<PayeeRule> & Pick<PayeeRule, 'name' | 'role'>): PayeeRule => ({ id: `p${++n}`, amount: null, day: null, aliases: [], ...p });

const SURESH = payee({ role: 'employee', name: 'Suresh Pawar', amount: 14000, day: 1 });
const RAJESH = payee({ role: 'employee', name: 'Rajesh Kumar', amount: 12000 });
const RAMESH = payee({ role: 'landlord', name: 'Ramesh Gupta', amount: 28000, day: 5 });
const GANESH = payee({ role: 'supplier', name: 'Shree Ganesh Distributors' });
const BAJAJ = payee({ role: 'lender', name: 'Bajaj Finance', amount: 18500 });
const NET = payee({ role: 'utility', name: 'ACT Fibernet', aliases: ['actfibernet@icici'] });

const match = (payees: PayeeRule[], narration: string, dir: 'C' | 'D' = 'D', amount = 1000) => buildProfileMatcher(payees)(narration, dir, amount);

describe('profile matching', () => {
  it.each([
    ['UPI/DR/412345678901/SURESH PAWAR/YESB/Payment', SURESH, 'salary'],
    ['NEFT DR-HDFC0001432-SURESH PAWAR-N858149707', SURESH, 'salary'],
    ['IMPS/P2A/4123/SURESH PAWA/SBIN', SURESH, 'salary'], // bank truncated the surname
    ['SALARY/RAJESH K/UPI', RAJESH, 'salary'], // initial for the surname
    ['IMPS/P2A/1/RAMESH GUPTA/Shop', RAMESH, 'rent'],
    ['NEFT DR-SHREE GANESH DISTRIBUTORS', GANESH, 'suppliers'],
    ['NACH DR/BAJAJ FINANCE LTD/EMI', BAJAJ, 'emi'],
  ] as const)('%s -> %s', (narration, p, category) => {
    expect(match([SURESH, RAJESH, RAMESH, GANESH, BAJAJ], narration, 'D', p.amount ?? 1000)).toEqual({ payee: p, category });
  });

  it('joined names still match (SALARY/RAJESHK)', () => {
    expect(match([RAJESH], 'SALARY/RAJESHK/UPI', 'D', 12000)?.payee).toBe(RAJESH);
    expect(match([payee({ role: 'employee', name: 'Manoj S' })], 'SALARY/MANOJS/UPI')?.category).toBe('salary');
  });

  it('a UPI id alias matches even when the name is not in the narration', () => {
    expect(match([NET], 'UPI/DR/771/actfibernet@icici/Bill')?.payee).toBe(NET);
    const suresh = payee({ role: 'employee', name: 'Suresh Pawar', aliases: ['suresh.p@okaxis'] });
    expect(match([suresh], 'UPI/DR/123/suresh.p@okaxis/Payment')?.payee).toBe(suresh);
  });

  it('never matches money coming in (the same person can be a customer)', () => {
    expect(match([SURESH], 'UPI/CR/412/SURESH PAWAR/Payment', 'C')).toBeNull();
  });

  it.each([
    ['UPI/DR/1/SURESH MEHTA/Payment', 'first name alone is not enough'],
    ['UPI/DR/1/PAWAR TRADERS/Payment', 'surname alone is not enough'],
    ['UPI/DR/1/SURESHWAR PAWAR', 'a word that only starts with the name does not count'],
    ['UPI/DR/1/RAJESH KHANNA', 'an initial must stand alone, not start another word'],
    ['UPI/DR/1/SU PAWAR', 'truncation needs at least 3 letters'],
  ])('%s: no match (%s)', (narration) => {
    expect(match([SURESH, RAJESH], narration)).toBeNull();
  });

  it('a short single-word name needs a whole-word match', () => {
    const om = payee({ role: 'supplier', name: 'Om' });
    const balaji = payee({ role: 'supplier', name: 'Balaji' });
    expect(match([om], 'UPI/DR/1/OM TRADERS')).toBeNull(); // too short to trust
    expect(match([balaji], 'NEFT/BALAJI FMCG/123')?.payee).toBe(balaji);
    expect(match([balaji], 'NEFT/BALAJIFMCG/123')).toBeNull(); // a one-word name must be a whole word
  });

  it('ignores titles and company suffixes in the owner’s spelling', () => {
    const ramesh = payee({ role: 'landlord', name: 'Mr. Ramesh Gupta' });
    expect(match([ramesh], 'IMPS/P2A/1/RAMESH GUPTA/Rent')?.payee).toBe(ramesh);
    const hul = payee({ role: 'supplier', name: 'Metro Wholesale Pvt Ltd' });
    expect(match([hul], 'IMPS/METRO WHOLESALE/123')?.payee).toBe(hul);
  });

  it('prefers the payee with more matching words', () => {
    const ramesh = payee({ role: 'landlord', name: 'Ramesh' });
    const traders = payee({ role: 'supplier', name: 'Ramesh Traders' });
    expect(match([ramesh, traders], 'NEFT/RAMESH TRADERS/99')?.payee).toBe(traders);
  });

  it('breaks a tie with the typical amount', () => {
    const a = payee({ role: 'employee', name: 'Anita Kamble', amount: 12000 });
    const b = payee({ role: 'landlord', name: 'Anita Kamble', amount: 30000 });
    expect(match([a, b], 'IMPS/ANITA KAMBLE', 'D', 29500)?.payee).toBe(b);
    expect(match([a, b], 'IMPS/ANITA KAMBLE', 'D', 12000)?.payee).toBe(a);
  });

  // Found by the evaluation: small UPI payments to an employee (tea money, personal transfers) were called salary.
  describe('fixed-amount payees (salary, rent, EMI) only match near their usual amount', () => {
    const rajesh = payee({ role: 'employee', name: 'Rajesh K', amount: 21000 });
    it.each([
      [21000, true],
      [19215, true],
      [9000, true], // 43%: half-month salary still counts
      [600, false], // tea money / personal transfer
      [8000, false], // 38%
      [60000, false], // almost 3x
    ])('₹%d to an employee on ₹21,000 -> matched: %s', (amount, matched) => {
      expect(match([rajesh], 'UPI/RAJESHK@OKHDFCBANK/1234/UPI', 'D', amount) !== null).toBe(matched);
    });

    it('no usual amount given: any amount matches', () => {
      expect(match([payee({ role: 'employee', name: 'Rajesh K' })], 'SALARY/RAJESH K/UPI', 'D', 600)).not.toBeNull();
    });

    it('suppliers and bills vary, so they are not limited by amount', () => {
      const s = payee({ role: 'supplier', name: 'Balaji FMCG', amount: 20000 });
      const u = payee({ role: 'utility', name: 'ACT Fibernet', amount: 1000 });
      expect(match([s], 'NEFT/BALAJI FMCG/1', 'D', 900)).not.toBeNull();
      expect(match([u], 'ACT FIBERNET', 'D', 4000)).not.toBeNull();
    });

    it('when the employee is out of range, another matching payee can still win', () => {
      const landlord = payee({ role: 'landlord', name: 'Rajesh K', amount: 600 });
      expect(match([rajesh, landlord], 'IMPS/RAJESH K/1', 'D', 600)?.payee).toBe(landlord);
    });
  });

  it('an empty profile matches nothing', () => {
    expect(match([], 'SALARY/RAJESH K/UPI')).toBeNull();
  });
});
