import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { rowsFromExcel } from '../../src/engine/excel';
import { MESSAGES, StatementError, rowsToTxns } from '../../src/engine/parse';
import type { Cell } from '../../src/engine/types';

function workbook(sheets: Record<string, Cell[][]>, bookType: XLSX.BookType, merges?: XLSX.Range[]): Uint8Array {
  const wb = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    const ws = XLSX.utils.aoa_to_sheet(rows);
    if (merges) ws['!merges'] = merges;
    XLSX.utils.book_append_sheet(wb, ws, name);
  }
  return new Uint8Array(XLSX.write(wb, { type: 'array', bookType }) as ArrayBuffer);
}

const statement: Cell[][] = [
  ['Shop current account'],
  [],
  ['Txn Date', 'Narration', 'Withdrawal Amt.', 'Deposit Amt.', 'Closing Balance'],
  [46113, 'UPI/CR/1/CUSTOMER', '', 1250.5, 101250.5], // Excel serial for 2026-04-01
  [46114, 'NEFT DR-SHREE GANESH DISTRIBUTORS', 20000, '', 81250.5],
  ['03/04/2026', 'UPI SALE', '', 300, 81550.5], // a text date in the same column
];

describe('rowsFromExcel', () => {
  it.each(['xlsx', 'biff8'] as const)('reads %s with serial dates', (bookType) => {
    const t = rowsToTxns(rowsFromExcel(workbook({ Sheet1: statement }, bookType)));
    expect(t.map((x) => [x.date, x.withdrawal, x.deposit, x.balance])).toEqual([
      ['2026-04-01', 0, 1250.5, 101250.5],
      ['2026-04-02', 20000, 0, 81250.5],
      ['2026-04-03', 0, 300, 81550.5],
    ]);
  });

  it('reads merged header cells', () => {
    const rows: Cell[][] = [
      ['Date', 'Narration', 'Amount', '', 'Balance'],
      ['', '', 'Debit', 'Credit', ''],
      [46113, 'RENT', 5000, '', 1000],
      [46114, 'UPI SALE', '', 700, 1700],
    ];
    const bytes = workbook({ S: rows }, 'xlsx', [{ s: { r: 0, c: 2 }, e: { r: 0, c: 3 } }]);
    const t = rowsToTxns(rowsFromExcel(bytes));
    expect(t.map((x) => [x.withdrawal, x.deposit])).toEqual([
      [5000, 0],
      [0, 700],
    ]);
  });

  it('picks the sheet that has the transactions', () => {
    const bytes = workbook({ Summary: [['Account summary'], ['Opening', 1000]], Transactions: statement }, 'xlsx');
    expect(rowsToTxns(rowsFromExcel(bytes))).toHaveLength(3);
  });

  it('rejects a PDF renamed to .xlsx with the PDF message', () => {
    expect(() => rowsFromExcel(new TextEncoder().encode('%PDF-1.7 ...'))).toThrow(MESSAGES.pdf);
  });

  it('rejects an empty file', () => {
    expect(() => rowsFromExcel(new Uint8Array())).toThrow(StatementError);
  });
});
