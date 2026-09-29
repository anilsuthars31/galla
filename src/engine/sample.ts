/* Built-in sample statement: a fictional kirana store in Pune, April to September 2026.
   Seeded, so it is the same on every load. Ported from prototype/engine.js (sampleRows);
   the output is identical row for row (see tests/engine/parity.test.ts). */
import type { Cell } from './types';
import { MONTH_SHORT, dayOfWeek, daysInMonth, toIso } from './months';

const YEAR = 2026;

export function sampleStatementRows(): Cell[][] {
  let seed = 20260401;
  const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  const r = (a: number, b: number) => a + rnd() * (b - a);
  const ref = () => String(Math.floor(r(1e11, 9.99e11)));
  const pick = <T,>(list: readonly T[]): T => list[Math.floor(r(0, list.length))]!;
  const season: Record<number, number> = { 3: 1.0, 4: 1.06, 5: 0.96, 6: 0.86, 7: 0.9, 8: 0.9 };
  const people = [
    ['PRIYA DESHMUKH', 'priyad@oksbi'],
    ['ROHIT JOSHI', 'rohitj99@ybl'],
    ['SNEHA KULKARNI', 'snehak@okaxis'],
    ['AMIT PATIL', '9823011122@paytm'],
    ['VIKRAM SHINDE', 'vikram.s@ibl'],
    ['NEHA GOKHALE', 'nehag@okicici'],
    ['SANJAY MORE', 'sanjaymore@ybl'],
    ['POOJA JADHAV', 'poojaj@oksbi'],
  ] as const;

  interface Row {
    sortKey: number;
    month: number;
    day: number;
    narr: string;
    dr: number;
    cr: number;
  }
  const rows: Row[] = [];
  const add = (month: number, day: number, narr: string, dr: number, cr: number) =>
    rows.push({ sortKey: month * 100 + day, month, day, narr, dr: Math.round(dr * 100) / 100, cr: Math.round(cr * 100) / 100 });

  for (let mo = 3; mo <= 8; mo++) {
    const days = daysInMonth(YEAR * 12 + mo);
    const k = season[mo]!;
    const mon = MONTH_SHORT[mo]!;
    for (let day = 1; day <= days; day++) {
      const dow = dayOfWeek(toIso(YEAR, mo + 1, day));
      const at = (narr: string, dr: number, cr: number) => add(mo, day, narr, dr, cr);
      at(`NEFT CR-YESB0000001-BHARATPE SETTLEMENT-SHARMA KIRANA-N${ref().slice(0, 9)}`, 0, r(5600, 8200) * k);
      const nUpi = Math.floor(r(1, 4));
      for (let j = 0; j < nUpi; j++) {
        const p = pick(people);
        at(`UPI/CR/${ref()}/${p[0]}/${p[1]}/Payment from Ph`, 0, Math.round(r(80, 1600)));
      }
      if (dow === 1) at(`BY CASH DEPOSIT-CDM PUNE KOTHRUD-${ref().slice(0, 6)}`, 0, (Math.round((r(26000, 40000) * k) / 500) * 500));
      if (dow === 2 || dow === 5) at(`NEFT DR-HDFC0001432-SHREE GANESH DISTRIBUTORS-N${ref().slice(0, 9)}`, r(19000, 27000) * k, 0);
      if (dow === 4) at(`UPI/DR/${ref()}/AGARWAL TRADERS/agarwaltraders@okhdfcbank/Stock`, Math.round(r(11000, 17000) * k), 0);
      if (day === 1) {
        at(`UPI/DR/${ref()}/SURESH PAWAR/suresh.p@ybl/Salary ${mon}`, 14000, 0);
        at(`UPI/DR/${ref()}/ANITA KAMBLE/anitak@ibl/Salary`, 12000, 0);
      }
      if (day === 5) at(`IMPS/P2A/${ref()}/RAMESH GUPTA/SBIN0011234/Shop rent`, 28000, 0);
      if (day === 7 && mo >= 6) at(`NACH DR/BAJAJ FINANCE LTD/ACH-DR-4501${Math.floor(r(1000, 9999))}`, 18500, 0);
      if (day === 10) at(`BILLDESK/MSEDCL ELECTRICITY/170012345678`, Math.round(r(5400, 6200) + (mo <= 5 ? 1600 : 0)), 0);
      if (day === 12) at(`UPI/DR/${ref()}/AIRTEL/airtelbroadband@paytm/Broadband`, 999, 0);
      if (day === 14) at(`NEFT DR-SBIN0000691-METRO CASH AND CARRY INDIA-N${ref().slice(0, 9)}`, r(28000, 36000) * k, 0);
      if (day === 15 && (mo === 5 || mo === 8)) at(`CBDT ADV TAX CHALLAN 280/${ref().slice(0, 8)}`, 24000, 0);
      if (day === 19) at(`GST PAYMENT CPIN 2604${ref()}/GSTN`, Math.round(r(6500, 9000)), 0);
      if (day === 22) at(`UPI/DR/${ref()}/NETFLIX/netflix@hdfcbank/Mandate`, 649, 0);
      if (day === 28) at(`CHRG:QR RENTAL ${mon.toUpperCase()}26 INCL GST`, 354, 0);
      if ([3, 11, 17, 24].includes(day) && rnd() < 0.8) at(`UPI/DR/${ref()}/ZOMATO/zomato.order@hdfcbank/Order`, Math.round(r(280, 850)), 0);
      if (rnd() < 0.018) at(`UPI/DR/${ref()}/MYNTRA DESIGNS/myntra@icici/Order`, Math.round(r(1200, 3200)), 0);
      if ((day === 9 || day === 25) && rnd() < 0.75) {
        at(`ATM WDL/ATM SBI KOTHRUD PUNE/${ref().slice(0, 6)}`, [5000, 8000, 10000][Math.floor(r(0, 3))]!, 0);
      }
    }
    if (mo === 5 || mo === 8) add(mo, days, `SMS ALERT CHRG ${mo === 5 ? 'APR-JUN' : 'JUL-SEP'}26`, 17.7, 0);
    if (mo === 5) add(mo, days, `INT.PD:01-04-2026 TO 30-06-2026`, 0, 1184);
  }
  rows.sort((a, b) => a.sortKey - b.sortKey);

  let bal = 185000;
  const out: Cell[][] = [
    ['Sharma Kirana & General Store — Current Account XXXX4521'],
    ['Statement period 01/04/2026 to 30/09/2026'],
    [],
    ['Txn Date', 'Narration', 'Withdrawal Amt.', 'Deposit Amt.', 'Closing Balance'],
  ];
  const pad = (n: number) => String(n).padStart(2, '0');
  for (const x of rows) {
    bal += x.cr - x.dr;
    out.push([`${pad(x.day)}/${pad(x.month + 1)}/${YEAR}`, x.narr, x.dr || '', x.cr || '', Math.round(bal * 100) / 100]);
  }
  return out;
}
