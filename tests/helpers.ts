import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import type { RawTxn, Txn } from '../src/engine/types';
import { enrich } from '../src/engine/categorize';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export const readText = (rel: string) => readFileSync(join(ROOT, rel), 'utf8');
export const fixture = (name: string) => readText(`tests/fixtures/${name}`);

export const SYNTHETIC = 'data/synthetic/hdfc_kirana_bengaluru_v1.csv';

let seq = 0;
/** Quick RawTxn builder: positive amount = deposit, negative = withdrawal. */
export function raw(date: string, narration: string, amount: number, balance: number | null = null): RawTxn {
  return {
    date,
    narration,
    withdrawal: amount < 0 ? -amount : 0,
    deposit: amount > 0 ? amount : 0,
    balance,
    order: seq++,
  };
}

export const txns = (rows: RawTxn[]): Txn[] => enrich(rows);

/** Monthly rows for months [startMonth .. startMonth+count) of 2026, on a given day. */
export function monthly(narration: string, amount: number, day: number, months: number[], jitter: (i: number) => number = () => 0): RawTxn[] {
  return months.map((m, i) => raw(`2026-${String(m).padStart(2, '0')}-${String(day).padStart(2, '0')}`, narration, amount + jitter(i)));
}

/** Loads prototype/engine.js (a browser IIFE) and returns its Galla object. */
export function loadPrototype(): any {
  const src = readText('prototype/engine.js');
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  return new Function('module', `${src}\nreturn Galla;`)(undefined);
}
