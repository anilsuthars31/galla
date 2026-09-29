import { describe, expect, it } from 'vitest';
import { CSV_COLUMNS, correctionsCsv, countCorrections } from '../../src/engine/corrections';
import { enrich } from '../../src/engine/categorize';
import { parseCSV, parseStatementText } from '../../src/engine/parse';
import { raw } from '../helpers';

const rows = [
  raw('2026-04-02', 'UPI/DR/1/AGARWAL TRADERS/x@okhdfcbank/Stock, "urgent"', -5000, 95000),
  raw('2026-04-03', 'UPI/CR/1/CUSTOMER ONE/x@ybl/Payment', 300, 95300),
  raw('2026-05-02', 'UPI/DR/2/AGARWAL TRADERS/x@okhdfcbank/Stock', -7000.5, null),
];

describe('correctionsCsv', () => {
  it('uses the canonical columns', () => {
    expect(CSV_COLUMNS.join(',')).toBe('date,narration,withdrawal,deposit,balance,category,source');
  });

  it('is just the header when there are no corrections', () => {
    expect(correctionsCsv(enrich(rows))).toBe('date,narration,withdrawal,deposit,balance,category,source\n');
  });

  it('exports every row the owner re-categorized, with source=correction', () => {
    const t = enrich(rows, { 'agarwaltraders:D': 'other' });
    expect(countCorrections(t)).toBe(2);
    expect(correctionsCsv(t)).toBe(
      'date,narration,withdrawal,deposit,balance,category,source\n' +
        '2026-04-02,"UPI/DR/1/AGARWAL TRADERS/x@okhdfcbank/Stock, ""urgent""",5000.00,,95000.00,other,correction\n' +
        '2026-05-02,UPI/DR/2/AGARWAL TRADERS/x@okhdfcbank/Stock,7000.50,,,other,correction\n',
    );
  });

  it('reads back through the parser unchanged', () => {
    const t = enrich(rows, { 'agarwaltraders:D': 'other' });
    const csv = correctionsCsv(t);
    const back = parseStatementText(csv);
    expect(back.map((r) => [r.date, r.narration, r.withdrawal, r.balance])).toEqual([
      ['2026-04-02', rows[0]!.narration, 5000, 95000],
      ['2026-05-02', rows[2]!.narration, 7000.5, null],
    ]);
    expect(parseCSV(csv).slice(1).map((r) => r[5])).toEqual(['other', 'other']);
  });
});
