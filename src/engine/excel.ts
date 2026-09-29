/* Excel (.xls / .xlsx) bytes -> rows of cells, using SheetJS. Kept apart from parse.ts so the
   UI can load SheetJS only when an Excel file is actually uploaded. */
import * as XLSX from 'xlsx';
import type { Cell } from './types';
import { MESSAGES, StatementError, findHeader, isPdfBytes } from './parse';

/**
 * Reads the first sheet that contains a transaction table (or the first sheet).
 * Dates come back as Excel serial numbers (no cellDates), which parseDate converts without time zones.
 */
export function rowsFromExcel(data: ArrayBuffer | Uint8Array): Cell[][] {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  if (bytes.length === 0) throw new StatementError(MESSAGES.empty);
  if (isPdfBytes(bytes)) throw new StatementError(MESSAGES.pdf);
  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(bytes, { type: 'array' });
  } catch {
    throw new StatementError(MESSAGES.unreadable);
  }
  const sheets = wb.SheetNames.map((name) => {
    const ws = wb.Sheets[name];
    return ws ? XLSX.utils.sheet_to_json<Cell[]>(ws, { header: 1, raw: true, defval: '', blankrows: false }) : [];
  });
  return sheets.find((rows) => findHeader(rows) !== null) ?? sheets[0] ?? [];
}
