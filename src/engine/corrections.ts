/* Owner corrections -> CSV in the canonical data format, for the next training run
   (saved by the owner into data/corrections/). */
import type { Txn } from './types';

export const CSV_COLUMNS = ['date', 'narration', 'withdrawal', 'deposit', 'balance', 'category', 'source'] as const;

function csvCell(v: string): string {
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

const money = (n: number) => (n ? n.toFixed(2) : '');

/** Every transaction whose category the owner chose, with source=correction. Header only when there are none. */
export function correctionsCsv(txns: readonly Txn[]): string {
  const lines = [CSV_COLUMNS.join(',')];
  for (const t of txns) {
    if (t.source !== 'owner') continue;
    lines.push(
      [t.date, csvCell(t.narration), money(t.withdrawal), money(t.deposit), t.balance === null ? '' : t.balance.toFixed(2), t.category, 'correction'].join(','),
    );
  }
  return lines.join('\n') + '\n';
}

export function countCorrections(txns: readonly Txn[]): number {
  return txns.filter((t) => t.source === 'owner').length;
}
