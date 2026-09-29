/* Forecast backtest (CLAUDE.md "Evaluation"): train on months 1-3, predict months 4-6, report MAPE.
   Run: npm run eval:forecast   -> writes docs/forecast_results.md
   Uses the app's own parser and engine. Categories come from rules only (no model), so nothing learned
   from months 4-6 leaks into the forecast. */
import { writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { it } from 'vitest';
import { parseStatementText, processStatement, summarizeMonths, enrich, monthLabel, type MonthIndex } from '../../src/engine';
import { ROOT, readText } from '../helpers';

const EXCLUDED = new Set(['CHANGELOG.csv', 'hdfc_kirana_bengaluru_v1.csv']); // see docs/decisions.md D8
const TRAIN_MONTHS = 3;
const HORIZON = 3;

type Method = 'galla' | 'avg3' | 'last';
const METHODS: Record<Method, string> = {
  galla: 'Galla (conservative)',
  avg3: 'Plain 3-month average',
  last: 'Repeat last month',
};

interface Row {
  file: string;
  months: MonthIndex[];
  actual: { inflow: number[]; outflow: number[]; endBalance: number };
  pred: Record<Method, { inflow: number[]; outflow: number[]; endBalance: number }>;
}

const monthOfIso = (iso: string) => Number(iso.slice(0, 4)) * 12 + Number(iso.slice(5, 7)) - 1;
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const mape = (p: number[], a: number[]) => mean(p.map((v, i) => Math.abs(v - a[i]!) / a[i]!));
const bias = (p: number[], a: number[]) => mean(p.map((v, i) => (v - a[i]!) / a[i]!));
const localDate = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const signed = (x: number) => `${x >= 0 ? '+' : '−'}${Math.abs(x * 100).toFixed(1)}%`;
const lakh = (x: number) => `₹${(x / 1e5).toFixed(2)}L`;

function backtest(file: string): Row {
  const raw = parseStatementText(readText(`data/synthetic/${file}`));
  const first = monthOfIso(raw.reduce((m, t) => (t.date < m ? t.date : m), raw[0]!.date));
  const cut = first + TRAIN_MONTHS;
  const train = raw.filter((t) => monthOfIso(t.date) < cut);
  const all = summarizeMonths(enrich(raw));
  const testMonths = all.filter((m) => m.month >= cut && m.month < cut + HORIZON);
  if (testMonths.length !== HORIZON) throw new Error(`${file}: needs ${TRAIN_MONTHS + HORIZON} months`);

  const { analysis } = processStatement(train);
  const basis = analysis.months;
  const start = analysis.currentBalance ?? 0;
  const flat = (inflow: number, outflow: number) => ({
    inflow: Array(HORIZON).fill(inflow),
    outflow: Array(HORIZON).fill(outflow),
    endBalance: start + HORIZON * (inflow - outflow),
  });
  const lastM = basis[basis.length - 1]!;
  return {
    file,
    months: testMonths.map((m) => m.month),
    actual: {
      inflow: testMonths.map((m) => m.inflow),
      outflow: testMonths.map((m) => m.outflow),
      endBalance: testMonths[HORIZON - 1]!.endBalance!,
    },
    pred: {
      galla: {
        inflow: analysis.forecast.map((f) => f.inflow),
        outflow: analysis.forecast.map((f) => f.outflow),
        endBalance: analysis.forecast[HORIZON - 1]!.endBalance!,
      },
      avg3: flat(mean(basis.map((m) => m.inflow)), mean(basis.map((m) => m.outflow))),
      last: flat(lastM.inflow, lastM.outflow),
    },
  };
}

/** Plain-language findings, computed from the numbers so they stay true when the data changes. */
function findings(rows: Row[]): string[] {
  const same = rows.every((r) => r.pred.galla.inflow.every((v, i) => Math.abs(v - r.pred.avg3.inflow[i]!) < 0.5));
  const over = rows.filter((r) => r.pred.galla.endBalance > r.actual.endBalance);
  const outBias = mean(rows.map((r) => bias(r.pred.galla.outflow, r.actual.outflow)));
  const out: string[] = [];
  if (same) {
    out.push(
      `- **With ${TRAIN_MONTHS} months of history, Galla's income forecast equals the plain ${TRAIN_MONTHS}-month average.** ` +
        'The rule "lower of the last-3-month and whole-period average" (docs/decisions.md D9) only differs from a plain average ' +
        'when there are more than 3 months to average over, so this backtest cannot show its protective effect.',
    );
  }
  out.push(
    over.length > rows.length / 2
      ? `- **The closing balance was overstated in ${over.length} of ${rows.length} files** ` +
          `(${over.map((r) => r.file.replace('.csv', '')).join(', ')}). The forecast is not on the safe side here: ` +
          `outflow was under-forecast by ${signed(outBias).replace('−', '')} on average, because spending in these files rises over time ` +
          '(e.g. the "growth" file moves from 80% to 90% of income spent). A forecast that overstates the balance is the risky direction for a shop owner.'
      : `- The closing balance was overstated in ${over.length} of ${rows.length} files, so the forecast is mostly on the safe side.`,
  );
  out.push(
    '- **Possible fix to evaluate next (not made):** forecast outflow from the higher of the recent and whole-period averages, ' +
      'mirroring the income rule, then re-run this backtest. It is a finance rule, so it needs the owner-side decision first.',
  );
  return out;
}

function table(header: string[], rows: string[][]): string {
  return [`| ${header.join(' | ')} |`, `|${header.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.join(' | ')} |`)].join('\n');
}

it('forecast backtest -> docs/forecast_results.md', () => {
  const files = readdirSync(join(ROOT, 'data/synthetic')).filter((f) => f.endsWith('.csv') && !EXCLUDED.has(f)).sort();
  const rows = files.map(backtest);
  const methods = Object.keys(METHODS) as Method[];

  const perFile = rows.map((r) => [
    r.file.replace('.csv', ''),
    ...methods.flatMap((m) => [pct(mape(r.pred[m].inflow, r.actual.inflow)), pct(mape(r.pred[m].outflow, r.actual.outflow))]),
  ]);
  const avg = (fn: (r: Row) => number) => mean(rows.map(fn));
  const summary = methods.map((m) => [
    METHODS[m],
    pct(avg((r) => mape(r.pred[m].inflow, r.actual.inflow))),
    signed(avg((r) => bias(r.pred[m].inflow, r.actual.inflow))),
    pct(avg((r) => mape(r.pred[m].outflow, r.actual.outflow))),
    signed(avg((r) => bias(r.pred[m].outflow, r.actual.outflow))),
    signed(avg((r) => (r.pred[m].endBalance - r.actual.endBalance) / r.actual.endBalance)),
    `${rows.filter((r) => r.pred[m].endBalance <= r.actual.endBalance).length} of ${rows.length}`,
  ]);
  const balances = rows.map((r) => [
    r.file.replace('.csv', ''),
    lakh(r.actual.endBalance),
    ...methods.map((m) => lakh(r.pred[m].endBalance)),
  ]);

  const md = [
    '# Forecast backtest',
    '',
    `- **Date:** ${localDate()}`,
    '- **Command:** `npm run eval:forecast`',
    `- **Data:** ${rows.length} synthetic statements in \`data/synthetic/\` (${[...EXCLUDED].map((f) => `\`${f}\``).join(', ')} excluded)`,
    `- **Method:** give the app only months 1-${TRAIN_MONTHS} (${monthLabel(rows[0]!.months[0]! - TRAIN_MONTHS, true)}–${monthLabel(rows[0]!.months[0]! - 1, true)}), forecast months ${TRAIN_MONTHS + 1}-${TRAIN_MONTHS + HORIZON} (${rows[0]!.months.map((m) => monthLabel(m, true)).join(', ')}), compare with what actually happened. Categories from rules only, so nothing from the test months leaks in.`,
    '- **MAPE** = average of |forecast − actual| ÷ actual. **Bias** = average signed error: negative means the forecast was lower than reality.',
    '',
    '> Synthetic statements only, not a real-world score. Each file follows a scripted pattern (stable, growth, one loss month, volatile…), so real statements will be noisier.',
    '',
    '## Summary (average over files)',
    '',
    table(['Method', 'Inflow MAPE', 'Inflow bias', 'Outflow MAPE', 'Outflow bias', 'Closing balance error', 'Balance not overstated'], summary),
    '',
    '## Findings',
    '',
    ...findings(rows),
    '',
    '## MAPE per file',
    '',
    table(['File', ...methods.flatMap((m) => [`${METHODS[m]}: inflow`, 'outflow'])], perFile),
    '',
    `## Closing balance at the end of ${monthLabel(rows[0]!.months[HORIZON - 1]!, true)}`,
    '',
    table(['File', 'Actual', ...methods.map((m) => METHODS[m])], balances),
    '',
  ].join('\n');
  writeFileSync(join(ROOT, 'docs/forecast_results.md'), md);
  console.log(md);
});
