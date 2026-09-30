import { describe, expect, it } from 'vitest';
import { ruleCategory } from '../../src/engine/rules';
import { NARRATIONS } from '../fixtures/narrations';

describe('ruleCategory', () => {
  it.each([
    ['CHRG:QR RENTAL APR26 INCL GST', 'D', 'charges'],
    ['SMS ALERT CHRG APR-JUN26', 'D', 'charges'],
    ['GST PAYMENT CPIN 2604/GSTN', 'D', 'tax'],
    ['CBDT ADV TAX CHALLAN 280/1', 'D', 'tax'],
    ['NACH DR/BAJAJ FINANCE LTD', 'D', 'emi'],
    ['LOAN EMI', 'D', 'emi'],
    ['IMPS/P2A/1/RAMESH GUPTA/Shop rent', 'D', 'rent'],
    ['SALARY RAJESH', 'D', 'salary'],
    ['BILLDESK/MSEDCL ELECTRICITY', 'D', 'utilities'],
    ['UPI/DR/1/AIRTEL/Broadband', 'D', 'utilities'],
    ['UPI/DR/1/NETFLIX/Mandate', 'D', 'personal'],
    ['UPI/DR/1/SWIGGY/Order', 'D', 'personal'],
    ['NEFT DR-SHREE GANESH DISTRIBUTORS', 'D', 'suppliers'],
    ['NEFT DR-METRO CASH AND CARRY INDIA', 'D', 'suppliers'],
    ['NEFT CR-BHARATPE SETTLEMENT-SHOP', 'C', 'sales'],
    ['BY CASH DEPOSIT-CDM PUNE', 'C', 'sales'],
    ['UPI/CR/123/CUSTOMER', 'C', 'sales'],
    ['INT.PD:01-04-2026 TO 30-06-2026', 'C', 'other_income'],
  ] as const)('%s (%s) -> %s', (n, dir, cat) => {
    expect(ruleCategory(n, dir)).toBe(cat);
  });

  // Bug report 2026-09-30: BILL/INTERNET/... always landed in "needs review" (model 66% utilities).
  it.each([
    'BILL/INTERNET/name@okaxis',
    'BILLPAY/INTERNET SEP26',
    'UPI/DR/1/INTERNET BILL',
    'WIFI BILL SEP26',
    'BBPS/TATA PLAY DTH',
    'BILL/MOBILE/9876543210',
    'MOBILE POSTPAID BILL',
    'BILLDESK/DISH TV',
  ])('bill payment %s is utilities', (n) => {
    expect(ruleCategory(n, 'D')).toBe('utilities');
  });

  // Restaurant statement 2026-09-30: Jodhpur electricity (JDVVNL) and water (PHED) bills needed review.
  it.each([
    'BILL/JDVVNL/K1234',
    'BILLDESK/AVVNL AJMER',
    'BBPS/JVVNL JAIPUR',
    'BILL/PHED',
    'UPPCL ELECTRICITY BILL',
    'PSPCL/BILL',
    'BILL/TSSPDCL',
    'KSEB BILL PAYMENT',
    'CESC LTD',
    'DELHI JAL BOARD',
  ])('electricity / water board %s is utilities', (n) => {
    expect(ruleCategory(n, 'D')).toBe('utilities');
  });

  // Owner request 2026-09-30: recognise every state electricity board, water boards and LPG / piped gas.
  it.each([
    // electricity, by state
    'BILL/AVVNL POWER', 'BILL/AVVNLPOWER', 'JDVVNL JODHPUR', 'JVVNL', // Rajasthan
    'BSES RAJDHANI', 'BRPL/BILL', 'BYPL/BILL', 'TPDDL', 'NDMC ELECTRICITY', // Delhi
    'UPPCL', 'PVVNL', 'MVVNL', 'DVVNL', 'PUVVNL', 'KESCO KANPUR', 'NPCL NOIDA', // Uttar Pradesh
    'MSEDCL', 'MAHADISCOM', 'TATA POWER MUMBAI', 'ADANI ELECTRICITY', 'BEST ELECTRICITY BILL', // Maharashtra
    'PGVCL', 'UGVCL', 'MGVCL', 'DGVCL', 'TORRENT POWER', // Gujarat
    'MPPKVVCL', 'MPMKVVCL', 'MPPGVVCL', 'CSPDCL', // Madhya Pradesh, Chhattisgarh
    'BESCOM', 'MESCOM', 'HESCOM', 'GESCOM', 'CHESCOM', 'KSEB', // Karnataka, Kerala
    'TNEB', 'TANGEDCO', 'TNPDCL', // Tamil Nadu
    'APSPDCL', 'APEPDCL', 'APCPDCL', 'TSSPDCL', 'TSNPDCL', 'TGSPDCL', 'TGNPDCL', // Andhra, Telangana
    'WBSEDCL', 'CESC LTD', 'TPCODL', 'TPSODL', 'TPWODL', 'TPNODL', 'NBPDCL', 'SBPDCL', 'JBVNL', // East
    'PSPCL', 'UHBVN', 'DHBVN', 'HPSEB', 'UPCL DEHRADUN', 'JKPDD', // North
    'APDCL', 'MEPDCL', 'TSECL', 'MSPDCL', 'GOA ELECTRICITY DEPT', // North-east, Goa
    'BIJLI BILL', 'LIGHT BILL', 'POWER BILL SEP',
    // water
    'BILL/JODHPUR WATER WORKS', 'DELHI JAL BOARD', 'UP JAL NIGAM', 'BWSSB', 'HMWSSB', 'CMWSSB', 'KWA WATER', 'BILL/PHED',
    // LPG and piped gas
    'BILL/RAJASTHAN LPG SERVICES', 'INDANE GAS', 'INDANE/BOOKING', 'HP GAS', 'HPGAS', 'BHARAT GAS', 'BHARATGAS', 'SHIV GAS AGENCY',
    'NACH DR/TATA POWER/AUTOPAY', 'GAS CYLINDER REFILL', 'IGL PNG BILL', 'MGL', 'ADANI TOTAL GAS', 'GUJARAT GAS', 'GAIL GAS', 'TORRENT GAS', 'MNGL', 'PIPED GAS',
  ])('bill %s is utilities', (n) => {
    expect(ruleCategory(n, 'D')).toBe('utilities');
  });

  it.each([
    ['NEFT/BEST PRICE WHOLESALE/1', 'suppliers'], // Walmart's Best Price is a supplier, not BEST electricity
    ['UPI/DR/1/HPCL PETROL PUMP', null], // fuel, not LPG
    ['UPI/DR/1/BHARAT TRADERS', 'suppliers'],
  ])('%s is not mistaken for a bill', (n, cat) => {
    expect(ruleCategory(n, 'D')).toBe(cat);
  });

  it('internet banking is not an internet bill', () => {
    expect(ruleCategory('INTERNET BANKING TRF TO RAMESH', 'D')).toBeNull();
    expect(ruleCategory('INTERNETBANKING/IMPS/SUPPLIER', 'D')).not.toBe('utilities');
  });

  it('broadband providers are utilities', () => {
    expect(ruleCategory('ACT FIBERNET', 'D')).toBe('utilities');
    expect(ruleCategory('HATHWAY BROADBAND', 'D')).toBe('utilities');
  });

  it('Amazon purchases are personal (money out only)', () => {
    expect(ruleCategory('CARD PURCHASE AMAZON', 'D')).toBe('personal');
    expect(ruleCategory('AMAZON SELLER SERVICES SETTLEMENT', 'C')).toBe('sales');
  });

  it('Swiggy Instamart is stock buying (MART), not personal food delivery', () => {
    expect(ruleCategory('UPI/DR/1/SWIGGY INSTAMART/Order', 'D')).toBe('suppliers');
  });

  it('respects direction: a rule for money out never labels money in', () => {
    expect(ruleCategory('SALARY RAJESH', 'C')).toBeNull();
    expect(ruleCategory('NEFT CR-BHARATPE SETTLEMENT', 'D')).toBeNull();
  });

  describe('labelling rules from CLAUDE.md', () => {
    it('ATM cash withdrawals are other, not personal', () => {
      expect(ruleCategory('ATM WDL/ATM SBI KOTHRUD PUNE/123', 'D')).toBe('other');
      expect(ruleCategory('ATM CASH WDL', 'D')).toBe('other');
    });

    it('a refund received is other income', () => {
      expect(ruleCategory('UPI REFUND', 'C')).toBe('other_income');
      expect(ruleCategory('REFUND UPI REFUND', 'C')).toBe('other_income');
      expect(ruleCategory('CASHBACK CREDIT', 'C')).toBe('other_income');
    });

    it('a refunded bank charge (deposit) is other income, not charges', () => {
      expect(ruleCategory('REV CHRG SMS ALERT', 'C')).toBe('other_income');
      expect(ruleCategory('REVERSAL OF CHARGES', 'C')).toBe('other_income');
    });

    it('a reversal received is other income even when it mentions UPI', () => {
      expect(ruleCategory('REVERSAL UPI/CR/517821', 'C')).toBe('other_income');
    });

    it('a sale reversed (money going back out) is a withdrawal with no sales rule', () => {
      expect(ruleCategory('UPI REVERSAL CUSTOMER', 'D')).toBeNull();
    });

    it('the same payee is a customer or a payee depending on direction (hard case)', () => {
      expect(ruleCategory('UPI/ramesh@upi', 'C')).toBe('sales');
      expect(ruleCategory('UPI/ramesh@upi', 'D')).toBeNull();
    });
  });

  describe('bank narration fixtures', () => {
    for (const [bank, cases] of Object.entries(NARRATIONS)) {
      it.each(cases)(`${bank}: %s`, (n, dir, _rail, _payee, cat) => {
        expect(ruleCategory(n, dir)).toBe(cat);
      });
    }
  });
});
