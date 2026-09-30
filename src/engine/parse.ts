/* Statement rows (CSV text or spreadsheet cells) -> RawTxn[].
   Does not assume a bank: finds the header row, maps columns by name, and reads Indian date and
   amount formats. Errors are StatementError with a message written for the shop owner. */
import type { Cell, RawTxn } from './types';
import { isValidYmd, toIso } from './months';

export class StatementError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StatementError';
  }
}

export const MESSAGES = {
  empty: 'This file is empty. Download the statement again from net banking and upload the Excel or CSV file.',
  pdf: 'PDF statements can’t be read yet. Download the Excel or CSV statement from net banking and upload that instead.',
  unsupported:
    'This type of file can’t be read. Upload the statement as a CSV, XLS or XLSX file, downloaded from net banking.',
  unreadable:
    'This file couldn’t be opened. It may be damaged or password-protected. Download the Excel statement from net banking again and upload it.',
  noHeader:
    'We couldn’t find the transaction table in this file. A statement needs columns for date, narration (or description) and withdrawal/deposit amounts. Download the Excel statement from net banking and try again.',
  noAmounts:
    'We found the dates and narrations but no amount columns. The statement needs “Withdrawal” and “Deposit” (or “Debit” and “Credit”) columns, or one “Amount” column with a Dr/Cr column.',
  noRows:
    'We found the columns but no transactions with a valid date. Check that this is the full statement and not a summary page.',
} as const;

/* ---------- file kind ---------- */

export type FileKind = 'csv' | 'excel' | 'pdf' | 'unknown';

export function fileKind(name: string): FileKind {
  const n = name.toLowerCase();
  if (/\.(csv|txt|tsv)$/.test(n)) return 'csv';
  if (/\.(xlsx|xls|xlsm)$/.test(n)) return 'excel';
  if (/\.pdf$/.test(n)) return 'pdf';
  return 'unknown';
}

/** True when the bytes are a PDF, whatever the file is called. */
export function isPdfBytes(bytes: Uint8Array): boolean {
  return bytes.length >= 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
}

/* ---------- amounts ---------- */

export interface AmountInfo {
  /** Absolute value. */
  value: number;
  /** The cell held a number (as opposed to blank or text). */
  ok: boolean;
  /** Written with a minus sign or in brackets. */
  negative: boolean;
  /** "Dr" / "Cr" written next to the number. */
  marker: 'dr' | 'cr' | null;
}

const NO_AMOUNT: AmountInfo = { value: 0, ok: false, negative: false, marker: null };

export function readAmount(v: Cell): AmountInfo {
  if (typeof v === 'number') {
    return Number.isFinite(v) ? { value: Math.abs(v), ok: true, negative: v < 0, marker: null } : NO_AMOUNT;
  }
  if (typeof v !== 'string') return NO_AMOUNT;
  let s = v.replace(/[₹,\s]|INR|Rs\.?/gi, '');
  let marker: AmountInfo['marker'] = null;
  const mk = s.match(/^(dr|cr)\.?|(dr|cr)\.?$/i);
  if (mk) {
    marker = (mk[1] ?? mk[2] ?? '').toLowerCase() as 'dr' | 'cr';
    s = s.replace(mk[0], '');
  }
  let negative = false;
  if (/^\(.*\)$/.test(s)) {
    negative = true;
    s = s.slice(1, -1);
  }
  if (/^[-−]/.test(s)) {
    negative = true;
    s = s.slice(1);
  } else if (s.startsWith('+')) s = s.slice(1);
  if (!/^(\d+\.?\d*|\.\d+)$/.test(s)) return { ...NO_AMOUNT, marker };
  const n = Number(s);
  return Number.isFinite(n) ? { value: n, ok: true, negative, marker } : NO_AMOUNT;
}

/** Positive amount from a cell; 0 for blanks and text. Accepts commas, ₹, Rs, INR and Dr/Cr. */
export function parseAmount(v: Cell): number {
  return readAmount(v).value;
}

/* ---------- dates ---------- */

const MON: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

function excelSerialToIso(n: number): string | null {
  if (!(n > 20000 && n < 80000)) return null; // 1954..2119; anything else is not a statement date
  const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(n) * 864e5);
  return toIso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

function checked(y: number, m: number, d: number): string | null {
  return isValidYmd(y, m, d) ? toIso(y, m, d) : null;
}

/**
 * Date cell -> ISO YYYY-MM-DD, or null.
 * Accepts dd/mm/yy, dd/mm/yyyy, dd-mm-yyyy, dd.mm.yyyy, dd-Mon-yyyy, dd Mon yyyy, ISO and Excel serials.
 */
export function parseDate(v: Cell): string | null {
  if (v instanceof Date) {
    return Number.isNaN(v.getTime()) ? null : toIso(v.getFullYear(), v.getMonth() + 1, v.getDate());
  }
  if (typeof v === 'number') return excelSerialToIso(v);
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (/^\d{5}(\.\d+)?$/.test(s)) return excelSerialToIso(Number(s));
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?!\d)/);
  if (m) return checked(Number(m[1]), Number(m[2]), Number(m[3]));
  m = s.match(/^(\d{1,2})[/\-. ]([A-Za-z]{3,9}|\d{1,2})[/\-. ,]+(\d{2}|\d{4})(?!\d)/);
  if (!m) return null;
  const [, dd = '', mm = '', yy = ''] = m;
  const month = /\d/.test(mm) ? Number(mm) : MON[mm.slice(0, 3).toLowerCase()];
  if (month === undefined) return null;
  const year = yy.length === 2 ? 2000 + Number(yy) : Number(yy);
  return checked(year, month, Number(dd));
}

/* ---------- CSV ---------- */

/** Minimal CSV reader: quotes, doubled quotes, CRLF, comma or tab separators, UTF-8 BOM. */
export function parseCSV(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = '';
  let q = false;
  const t = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  for (let i = 0; i < t.length; i++) {
    const c = t[i]!;
    if (q) {
      if (c === '"') {
        if (t[i + 1] === '"') {
          cur += '"';
          i++;
        } else q = false;
      } else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',' || c === '\t') {
      row.push(cur);
      cur = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++;
      row.push(cur);
      rows.push(row);
      row = [];
      cur = '';
    } else cur += c;
  }
  if (cur !== '' || row.length) {
    row.push(cur);
    rows.push(row);
  }
  return rows;
}

/* ---------- header detection ---------- */

const NARR = /narrat|description|particular|remark|details/;
const DR_CR = /^(dr|cr)\s*\/\s*(dr|cr)$|^(debit|credit)\s*\/\s*(debit|credit)$/;

function lowerRow(r: readonly Cell[] | undefined): string[] {
  return (r ?? []).map((c) => (c == null ? '' : String(c)).toLowerCase().replace(/\s+/g, ' ').trim());
}

function isHeader(cols: readonly string[]): boolean {
  return cols.some((c) => /date/.test(c)) && cols.some((c) => NARR.test(c));
}

/** A row of short labels with no digits: the second line of a two-line or merged header. */
function isLabelRow(r: readonly string[]): boolean {
  return r.some(Boolean) && r.every((c) => !c || (!/\d/.test(c) && c.length <= 30));
}

/**
 * Joins two header lines column by column. A blank top cell under a merged heading takes the heading
 * from the left ("Amount" over "Dr" | "Cr" -> "amount dr", "amount cr").
 */
function mergeHeader(top: readonly string[], sub: readonly string[]): string[] {
  const out: string[] = [];
  let carry = '';
  for (let j = 0; j < Math.max(top.length, sub.length); j++) {
    const t = top[j] ?? '';
    const s = sub[j] ?? '';
    if (t) carry = t;
    const head = t || (s ? carry : '');
    out.push([head, s].filter(Boolean).join(' '));
  }
  return out;
}

export interface HeaderInfo {
  /** Lower-cased column names (merged when the header spans two lines). */
  cols: string[];
  /** Index of the first row after the header. */
  dataStart: number;
}

/** Finds the header row within the first 60 rows. It does not have to be on line 1. */
export function findHeader(rows: readonly (readonly Cell[])[]): HeaderInfo | null {
  for (let i = 0; i < Math.min(rows.length, 60); i++) {
    const top = lowerRow(rows[i]);
    const next = lowerRow(rows[i + 1]);
    if (isHeader(top)) {
      return isLabelRow(next) ? { cols: mergeHeader(top, next), dataStart: i + 2 } : { cols: top, dataStart: i + 1 };
    }
    if (isLabelRow(top) && isLabelRow(next) && !isHeader(next)) {
      const merged = mergeHeader(top, next);
      if (isHeader(merged)) return { cols: merged, dataStart: i + 2 };
    }
  }
  return null;
}

export interface ColumnMap {
  date: number;
  narration: number;
  withdrawal: number;
  deposit: number;
  amount: number;
  type: number;
  balance: number;
  balanceType: number;
  /** Payment status (payment-app exports: success / pending / failed), or -1. */
  status: number;
}

export function mapColumns(cols: readonly string[]): ColumnMap {
  const find = (re: RegExp, not?: RegExp) => cols.findIndex((c) => re.test(c) && !(not && not.test(c)));
  let date = find(/(txn|tran|transaction|posting).*date/);
  if (date < 0) date = find(/date/, /value/);
  if (date < 0) date = find(/date/);
  const balance = find(/balance|^bal\b/);
  const type = find(DR_CR) >= 0 ? find(DR_CR) : find(/type/);
  const next = cols[balance + 1];
  const balanceType = balance >= 0 && balance + 1 !== type && next !== undefined && DR_CR.test(next) ? balance + 1 : -1;
  return {
    date,
    narration: find(NARR),
    withdrawal: find(/withdraw|debit|\bdr\b/, /credit|\/|type|balance/),
    deposit: find(/deposit|credit|\bcr\b/, /debit|\/|type|balance/),
    amount: find(/^amount|amount \(|\bamt\b|^amt/),
    type,
    balance,
    balanceType,
    status: find(/^status$|^txn status|^transaction status|^payment status/),
  };
}

/** Statuses meaning the money never moved. "Reversed" is not here: banks show a reversal as its own row. */
const FAILED = /^(failed|failure|declined|rejected|cancell?ed|unsuccessful)$/i;

const text = (c: Cell) => (c == null ? '' : String(c)).replace(/\s+/g, ' ').trim();
const isBlank = (c: Cell) => text(c) === '';

function isCreditLabel(t: string): boolean | null {
  const s = t.toLowerCase();
  if (/^c$|\bcr\b|credit|deposit/.test(s)) return true;
  if (/^d$|\bdr\b|debit|withdraw/.test(s)) return false;
  return null;
}

/** Spreadsheet or CSV rows -> RawTxn[]. Throws StatementError with an owner-friendly message. */
export function rowsToTxns(rows: readonly (readonly Cell[])[]): RawTxn[] {
  if (!rows.length || rows.every((r) => r.every(isBlank))) throw new StatementError(MESSAGES.empty);
  const header = findHeader(rows);
  if (!header) throw new StatementError(MESSAGES.noHeader);
  const c = mapColumns(header.cols);
  const singleColumn = c.withdrawal < 0 && c.deposit < 0;
  if (c.date < 0 || c.narration < 0 || (singleColumn && c.amount < 0)) throw new StatementError(MESSAGES.noAmounts);

  const body = rows.slice(header.dataStart);
  // With one amount column and no Dr/Cr column, a minus sign anywhere means the sign is the direction.
  const signed = singleColumn && c.type < 0 && body.some((r) => readAmount(r[c.amount]).negative);

  const out: RawTxn[] = [];
  for (const r of body) {
    const date = parseDate(r[c.date]);
    const narration = text(r[c.narration]);
    if (!date) {
      // Continuation line: some banks wrap a long narration onto the next row with no date or amounts.
      const prev = out[out.length - 1];
      const onlyNarration = narration && r.every((cell, j) => j === c.narration || isBlank(cell));
      if (prev && onlyNarration && isBlank(r[c.date])) prev.narration = `${prev.narration} ${narration}`;
      continue;
    }
    let withdrawal = c.withdrawal >= 0 ? parseAmount(r[c.withdrawal]) : 0;
    let deposit = c.deposit >= 0 ? parseAmount(r[c.deposit]) : 0;
    if (singleColumn) {
      const a = readAmount(r[c.amount]);
      let credit = c.type >= 0 ? isCreditLabel(text(r[c.type])) : null;
      if (credit === null && a.marker) credit = a.marker === 'cr';
      if (credit === null) credit = signed ? !a.negative : false;
      if (credit) deposit = a.value;
      else withdrawal = a.value;
    }
    if (!withdrawal && !deposit) continue;
    if (c.status >= 0 && FAILED.test(text(r[c.status]))) continue; // money never moved
    let balance: number | null = null;
    if (c.balance >= 0) {
      const b = readAmount(r[c.balance]);
      if (b.ok) {
        const typeLabel = c.balanceType >= 0 ? isCreditLabel(text(r[c.balanceType])) : null;
        const overdrawn = b.negative || b.marker === 'dr' || typeLabel === false;
        balance = overdrawn ? -b.value : b.value;
      }
    }
    out.push({ date, narration, withdrawal, deposit, balance, order: out.length });
  }
  if (!out.length) throw new StatementError(MESSAGES.noRows);
  return out;
}

/** CSV/TSV text -> RawTxn[]. Recognises a PDF saved with the wrong extension. */
export function parseStatementText(content: string): RawTxn[] {
  if (content.startsWith('%PDF')) throw new StatementError(MESSAGES.pdf);
  if (!content.trim()) throw new StatementError(MESSAGES.empty);
  return rowsToTxns(parseCSV(content));
}

/** Turns anything thrown while reading a statement into a message for the owner. Never a stack trace. */
export function friendlyError(err: unknown): string {
  return err instanceof StatementError ? err.message : MESSAGES.unreadable;
}
