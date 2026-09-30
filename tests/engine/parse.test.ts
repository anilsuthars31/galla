import { describe, expect, it } from 'vitest';
import {
  MESSAGES,
  StatementError,
  fileKind,
  findHeader,
  friendlyError,
  isPdfBytes,
  parseAmount,
  parseCSV,
  parseDate,
  parseStatementText,
  readAmount,
  rowsToTxns,
} from '../../src/engine/parse';
import { SYNTHETIC, fixture, readText } from '../helpers';

describe('parseAmount', () => {
  it.each([
    ['1,23,456.78', 123456.78],
    ['₹1,250', 1250],
    ['Rs. 1,250.50', 1250.5],
    ['Rs 99', 99],
    ['INR 2,000', 2000],
    ['1,234.00 Dr', 1234],
    ['1,234.00 Cr.', 1234],
    ['Cr 500', 500],
    ['-750.25', 750.25],
    ['(300)', 300],
    [' 42 ', 42],
    [1500, 1500],
    [-1500, 1500],
    ['', 0],
    [null, 0],
    [undefined, 0],
    ['-', 0],
    ['NIL', 0],
  ] as const)('%s -> %s', (input, expected) => {
    expect(parseAmount(input)).toBe(expected);
  });

  it('keeps the sign and Dr/Cr marker', () => {
    expect(readAmount('1,000 Dr')).toMatchObject({ value: 1000, marker: 'dr', ok: true });
    expect(readAmount('-5')).toMatchObject({ value: 5, negative: true });
    expect(readAmount('abc').ok).toBe(false);
  });
});

describe('parseDate', () => {
  it.each([
    ['05/04/26', '2026-04-05'],
    ['05/04/2026', '2026-04-05'],
    ['5/4/2026', '2026-04-05'],
    ['05-04-2026', '2026-04-05'],
    ['05.04.2026', '2026-04-05'],
    ['05-Apr-2026', '2026-04-05'],
    ['05 Apr 2026', '2026-04-05'],
    ['5 April 2026', '2026-04-05'],
    ['05-Sept-2026', '2026-09-05'],
    ['05-Apr-26', '2026-04-05'],
    ['2026-04-05', '2026-04-05'],
    ['2026-04-05T10:30:00', '2026-04-05'],
    ['05/04/2026 14:22', '2026-04-05'],
    [46117, '2026-04-05'],
    [46117.75, '2026-04-05'],
    ['46117', '2026-04-05'],
  ] as const)('%s -> %s', (input, expected) => {
    expect(parseDate(input)).toBe(expected);
  });

  it('reads Date objects by their calendar day', () => {
    expect(parseDate(new Date(2026, 3, 5))).toBe('2026-04-05');
  });

  it.each(['31/02/2026', '32/01/2026', '12/13/2026', 'Opening balance', '', '1234', 'Totals', 100])('rejects %s', (v) => {
    expect(parseDate(v)).toBeNull();
  });

  it('handles leap years', () => {
    expect(parseDate('29/02/2028')).toBe('2028-02-29');
    expect(parseDate('29/02/2026')).toBeNull();
  });
});

describe('parseCSV', () => {
  it('handles quotes, doubled quotes, CRLF, tabs and a BOM', () => {
    const text = '﻿a,"b, c","say ""hi"""\r\n1\t2\t3\n';
    expect(parseCSV(text)).toEqual([
      ['a', 'b, c', 'say "hi"'],
      ['1', '2', '3'],
    ]);
  });

  it('keeps newlines inside quoted cells', () => {
    expect(parseCSV('"line one\nline two",x')).toEqual([['line one\nline two', 'x']]);
  });
});

describe('rowsToTxns: header detection', () => {
  it('finds a header that is not on line 1', () => {
    const rows = [['My Shop'], ['Account XXXX1234'], [], ['Date', 'Narration', 'Withdrawal', 'Deposit', 'Balance'], ['01/04/2026', 'UPI/CR/1', '', '100', '1100']];
    const t = rowsToTxns(rows);
    expect(t).toEqual([{ date: '2026-04-01', narration: 'UPI/CR/1', withdrawal: 0, deposit: 100, balance: 1100, order: 0 }]);
  });

  it('merges a header split over merged cells (Amount over Dr | Cr)', () => {
    const rows = [
      ['Date', 'Narration', 'Amount', '', 'Balance'],
      ['', '', 'Dr', 'Cr', ''],
      ['01/04/2026', 'RENT', '5000', '', '10000'],
      ['02/04/2026', 'UPI SALE', '', '700', '10700'],
    ];
    expect(findHeader(rows)?.cols).toEqual(['date', 'narration', 'amount dr', 'amount cr', 'balance']);
    const t = rowsToTxns(rows);
    expect(t.map((x) => [x.withdrawal, x.deposit])).toEqual([
      [5000, 0],
      [0, 700],
    ]);
  });

  it('merges a header written on two lines', () => {
    const rows = [
      ['Txn', 'Narration', 'Withdrawal', 'Deposit', 'Closing'],
      ['Date', '', 'Amt.', 'Amt.', 'Balance'],
      ['01/04/2026', 'RENT', '5000', '', '10000'],
    ];
    expect(findHeader(rows)?.cols).toEqual(['txn date', 'narration', 'withdrawal amt.', 'deposit amt.', 'closing balance']);
    expect(rowsToTxns(rows)[0]).toMatchObject({ withdrawal: 5000, balance: 10000 });
  });

  it('prefers the transaction date over the value date', () => {
    const rows = [
      ['Value Date', 'Transaction Date', 'Remarks', 'Debit', 'Credit'],
      ['30/04/2026', '01/04/2026', 'X', '10', ''],
    ];
    expect(rowsToTxns(rows)[0]!.date).toBe('2026-04-01');
  });

  it('joins narration continuation lines', () => {
    const rows = [
      ['Date', 'Narration', 'Withdrawal', 'Deposit'],
      ['01/04/2026', 'NEFT DR-HDFC0001432-SHREE GANESH', '5000', ''],
      ['', 'DISTRIBUTORS-N123', '', ''],
      ['02/04/2026', 'UPI SALE', '', '100'],
    ];
    expect(rowsToTxns(rows).map((t) => t.narration)).toEqual(['NEFT DR-HDFC0001432-SHREE GANESH DISTRIBUTORS-N123', 'UPI SALE']);
  });

  it('skips opening balance, totals and rows without an amount', () => {
    const rows = [
      ['Date', 'Narration', 'Withdrawal', 'Deposit', 'Balance'],
      ['', 'OPENING BALANCE', '', '', '1000'],
      ['01/04/2026', 'UPI SALE', '', '100', '1100'],
      ['02/04/2026', 'NO AMOUNT', '', '', '1100'],
      ['Total', '', '0', '100', ''],
    ];
    expect(rowsToTxns(rows)).toHaveLength(1);
  });
});

describe('rowsToTxns: amount layouts', () => {
  it('reads one amount column with a Dr/Cr column', () => {
    const rows = [
      ['Date', 'Description', 'Amount', 'Dr/Cr', 'Balance'],
      ['01/04/2026', 'UPI SALE', '1,000.00', 'CR', '11,000.00'],
      ['02/04/2026', 'RENT', '5,000.00', 'DR', '6,000.00'],
      ['03/04/2026', 'SALE', '200', 'C', '6,200.00'],
      ['04/04/2026', 'FEE', '20', 'D', '6,180.00'],
    ];
    expect(rowsToTxns(rows).map((t) => [t.withdrawal, t.deposit])).toEqual([
      [0, 1000],
      [5000, 0],
      [0, 200],
      [20, 0],
    ]);
  });

  it('reads Dr/Cr written inside the amount cell', () => {
    const rows = [
      ['Date', 'Narration', 'Amount'],
      ['01/04/2026', 'UPI SALE', '1,000.00 Cr'],
      ['02/04/2026', 'RENT', '5,000.00 Dr'],
    ];
    expect(rowsToTxns(rows).map((t) => [t.withdrawal, t.deposit])).toEqual([
      [0, 1000],
      [5000, 0],
    ]);
  });

  it('reads a signed amount column (minus = withdrawal)', () => {
    const rows = [
      ['Date', 'Narration', 'Amount'],
      ['01/04/2026', 'UPI SALE', '1000'],
      ['02/04/2026', 'RENT', '-5000'],
    ];
    expect(rowsToTxns(rows).map((t) => [t.withdrawal, t.deposit])).toEqual([
      [0, 1000],
      [5000, 0],
    ]);
  });

  it('works without a balance column', () => {
    const rows = [
      ['Date', 'Narration', 'Debit', 'Credit'],
      ['01/04/2026', 'UPI SALE', '', '1000'],
    ];
    expect(rowsToTxns(rows)[0]!.balance).toBeNull();
  });

  it('reads an overdrawn balance as negative', () => {
    const rows = [
      ['Date', 'Narration', 'Withdrawal', 'Deposit', 'Balance'],
      ['01/04/2026', 'RENT', '5000', '', '2,000.00 Dr'],
      ['02/04/2026', 'RENT', '5000', '', '-7000'],
    ];
    expect(rowsToTxns(rows).map((t) => t.balance)).toEqual([-2000, -7000]);
  });

  it('keeps a withdrawal and a deposit on the same row as reported', () => {
    const rows = [
      ['Date', 'Narration', 'Withdrawal', 'Deposit'],
      ['01/04/2026', 'ODD ROW', '10', '5'],
    ];
    expect(rowsToTxns(rows)[0]).toMatchObject({ withdrawal: 10, deposit: 5 });
  });
});

describe('bank formats', () => {
  const load = (name: string) => rowsToTxns(parseCSV(fixture(name)));

  it('SBI: header on line 6, "1 Apr 2026" dates, Debit/Credit, lakh commas, totals row', () => {
    const t = load('sbi_style.csv');
    expect(t).toHaveLength(3);
    expect(t[0]).toMatchObject({ date: '2026-04-01', deposit: 1250, balance: 101250 });
    expect(t[2]).toMatchObject({ withdrawal: 5000, narration: 'ATM WDL/ATM SBI KOTHRUD/123456' });
  });

  it('ICICI: transaction date after value date, "(INR )" headers, 0.00 in the empty column', () => {
    const t = load('icici_style.csv');
    expect(t.map((x) => [x.date, x.withdrawal, x.deposit])).toEqual([
      ['2026-04-01', 0, 8420.5],
      ['2026-04-03', 4317.98, 0],
      ['2026-04-07', 12500, 0],
    ]);
  });

  it('Axis: Tran Date, DR/CR columns, BAL', () => {
    const t = load('axis_style.csv');
    expect(t.map((x) => [x.date, x.withdrawal, x.deposit, x.balance])).toEqual([
      ['2026-04-01', 0, 2345, 32345],
      ['2026-04-04', 9816.77, 0, 22528.23],
      ['2026-04-30', 118, 0, 22410.23],
    ]);
  });

  it('Kotak: one Amount column with Dr/Cr, and a Dr/Cr column for the balance', () => {
    const t = load('kotak_style.csv');
    expect(t.map((x) => [x.withdrawal, x.deposit, x.balance])).toEqual([
      [0, 3210, 13210],
      [28000, 0, -14790],
      [0, 20000, 5210],
    ]);
  });

  it('HDFC: dd/mm/yy dates and Closing Balance', () => {
    const t = load('hdfc_style.csv');
    expect(t.map((x) => [x.date, x.withdrawal, x.deposit, x.balance])).toEqual([
      ['2026-04-01', 0, 850, 50850],
      ['2026-04-02', 6200, 0, 44650],
      ['2026-04-03', 0, 7400, 52050],
    ]);
  });

  it('canonical synthetic CSV (ISO dates, extra category/source columns)', () => {
    const t = parseStatementText(readText(SYNTHETIC));
    expect(t).toHaveLength(608);
    expect(t[0]).toEqual({ date: '2026-04-01', narration: 'UPI SETTLEMENT 890779946', withdrawal: 0, deposit: 2798.41, balance: 187798.41, order: 0 });
    expect(t[t.length - 1]!.balance).toBe(1445453.52);
  });
});

describe('errors for the shop owner', () => {
  const fails = (fn: () => unknown, message: string) => {
    let err: unknown;
    try {
      fn();
    } catch (e) {
      err = e;
    }
    expect(err).toBeInstanceOf(StatementError);
    expect((err as Error).message).toBe(message);
    expect((err as Error).message).not.toMatch(/at \w+ \(|undefined|null|Error:/);
  };

  it('empty file', () => {
    fails(() => parseStatementText(''), MESSAGES.empty);
    fails(() => parseStatementText('\n\n  \n'), MESSAGES.empty);
    fails(() => rowsToTxns([]), MESSAGES.empty);
    fails(() => rowsToTxns([['', ''], []]), MESSAGES.empty);
  });

  it('PDF content, even with a .csv name', () => {
    fails(() => parseStatementText('%PDF-1.7\n...'), MESSAGES.pdf);
    expect(isPdfBytes(new TextEncoder().encode('%PDF-1.4'))).toBe(true);
    expect(isPdfBytes(new TextEncoder().encode('Date,Narration'))).toBe(false);
  });

  it('no header row', () => {
    fails(() => parseStatementText('foo,bar\n1,2\n'), MESSAGES.noHeader);
  });

  it('no amount columns', () => {
    fails(() => parseStatementText('Date,Narration,Ref\n01/04/2026,X,1\n'), MESSAGES.noAmounts);
  });

  it('no rows with a valid date', () => {
    fails(() => parseStatementText('Date,Narration,Withdrawal,Deposit\nsoon,X,1,\n'), MESSAGES.noRows);
  });

  it('friendlyError never exposes internals', () => {
    expect(friendlyError(new TypeError("Cannot read properties of undefined (reading 'x')"))).toBe(MESSAGES.unreadable);
    expect(friendlyError(new StatementError(MESSAGES.pdf))).toBe(MESSAGES.pdf);
  });

  it('fileKind', () => {
    expect(fileKind('Statement.CSV')).toBe('csv');
    expect(fileKind('a.xlsx')).toBe('excel');
    expect(fileKind('a.xls')).toBe('excel');
    expect(fileKind('a.pdf')).toBe('pdf');
    expect(fileKind('a.docx')).toBe('unknown');
  });
});

describe('status column', () => {
  // Owner file 2026-09-30: a failed ₹21,500 salary and a failed ₹12,750 EMI were counted as money spent.
  const csv = [
    'date,narration,withdrawal,deposit,balance,status',
    '2026-09-10,UPI/SALARY/POOJA,21500,,100000,completed',
    '2026-09-10,UPI/SALARY/POOJA,21500,,78500,failed',
    '2026-09-12,UPI/SALARY/IRFAN,28900,,49600,pending',
    '2026-09-14,EMI/ADITYA BIRLA,12750,,36850,FAILED',
    '2026-09-15,UPI/CR/1/CUSTOMER,,5000,41850,Success',
    '2026-09-16,UPI/DR/2/SUPPLIER,1000,,40850,Declined',
    '2026-09-17,UPI/DR/3/SUPPLIER,1000,,39850,Cancelled',
    '2026-09-18,UPI/DR/4/SUPPLIER,1000,,38850,Failure',
    '2026-09-19,UPI/DR/5/SUPPLIER,1000,,37850,Rejected',
  ].join('\n');

  it('skips failed, declined, cancelled and rejected rows; keeps completed and pending', () => {
    const rows = parseStatementText(csv);
    expect(rows.map((r) => [r.narration, r.withdrawal || r.deposit])).toEqual([
      ['UPI/SALARY/POOJA', 21500],
      ['UPI/SALARY/IRFAN', 28900],
      ['UPI/CR/1/CUSTOMER', 5000],
    ]);
  });

  it('a file whose every row failed says so, rather than showing nothing', () => {
    expect(() => parseStatementText('date,narration,withdrawal,deposit,status\n2026-09-10,X,100,,failed')).toThrow(StatementError);
  });

  it('a narration that mentions "failed" is not a status', () => {
    const rows = parseStatementText('date,narration,withdrawal,deposit\n2026-09-10,REV FAILED TXN,,100');
    expect(rows).toHaveLength(1);
  });
});

describe('large files', () => {
  it('parses 6,000 rows quickly', () => {
    const lines = ['Date,Narration,Withdrawal,Deposit,Balance'];
    for (let i = 0; i < 6000; i++) {
      const d = String((i % 28) + 1).padStart(2, '0');
      const m = String((Math.floor(i / 1000) % 12) + 1).padStart(2, '0');
      lines.push(`${d}/${m}/2026,UPI/CR/${i}/CUSTOMER ${i % 50}/Payment,,${100 + (i % 900)},${100000 + i}`);
    }
    const start = performance.now();
    const t = parseStatementText(lines.join('\n'));
    expect(t).toHaveLength(6000);
    expect(performance.now() - start).toBeLessThan(1500);
  });
});
