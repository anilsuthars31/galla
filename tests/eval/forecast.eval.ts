/* Forecast backtest (CLAUDE.md "Evaluation"): the app forecasts next month only (D19), so this is a
   rolling one-month-ahead test. For each statement, give the app months 1..k and predict month k+1,
   for k = 3, 4, 5 (three predictions per file, each from data it had not seen).
   Run: npm run eval:forecast   -> writes docs/forecast_results.md
   Uses the app's own parser and engine. Categories come from rules only (no model), so nothing learned
   from the test month leaks into the forecast. */
import { writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { it } from 'vitest';
import { parseStatementText, processStatement, summarizeMonths, enrich, monthLabel, type MonthIndex } from '../../src/engine';
import { ROOT, readText } from '../helpers';

const EXCLUDED = new Set(['CHANGELOG.csv', 'hdfc_kirana_bengaluru_v1.csv']); // see docs/decisions.md D8
const ORIGINS = [3, 4, 5]; // months of history given before each prediction

type Method = 'galla' | 'avg3' | 'last';
const METHODS: Record<Method, string> = {
  galla: 'Galla (conservative)',
  avg3: 'Plain 3-month average',
  last: 'Repeat last month',
};

interface Point {
  inflow: number;
  outflow: number;
  endBalance: number;
}

interface Row {
  file: string;
  history: number;
  month: MonthIndex;
  actual: Point;
  pred: Record<Method, Point>;
}

const monthOfIso = (iso: string) => Number(iso.slice(0, 4)) * 12 + Number(iso.slice(5, 7)) - 1;
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
const ape = (p: number, a: number) => Math.abs(p - a) / a;
const err = (p: number, a: number) => (p - a) / a;
const localDate = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const signed = (x: number) => `${x >= 0 ? '+' : '−'}${Math.abs(x * 100).toFixed(1)}%`;

function backtest(file: string): Row[] {
  const raw = parseStatementText(readText(`data/synthetic/${file}`));
  const first = monthOfIso(raw.reduce((m, t) => (t.date < m ? t.date : m), raw[0]!.date));
  const actualMonths = summarizeMonths(enrich(raw));
  return ORIGINS.map((k) => {
    const cut = first + k;
    const train = raw.filter((t) => monthOfIso(t.date) < cut);
    const target = actualMonths.find((m) => m.month === cut);
    if (!target) throw new Error(`${file}: no month ${k + 1}`);
    const { analysis } = processStatement(train);
    const basis = analysis.months;
    const start = analysis.currentBalance ?? 0;
    const flat = (inflow: number, outflow: number): Point => ({ inflow, outflow, endBalance: start + inflow - outflow });
    const recent = basis.slice(-3);
    const lastM = basis[basis.length - 1]!;
    const f = analysis.forecast[0]!;
    return {
      file,
      history: k,
      month: cut,
      actual: { inflow: target.inflow, outflow: target.outflow, endBalance: target.endBalance! },
      pred: {
        galla: { inflow: f.inflow, outflow: f.outflow, endBalance: f.endBalance! },
        avg3: flat(mean(recent.map((m) => m.inflow)), mean(recent.map((m) => m.outflow))),
        last: flat(lastM.inflow, lastM.outflow),
      },
    };
  });
}

/** Plain-language findings, computed from the numbers so they stay true when the data changes. */
function findings(rows: Row[]): string[] {
  const out: string[] = [];
  const over = rows.filter((r) => r.pred.galla.endBalance > r.actual.endBalance);
  const outBias = mean(rows.map((r) => err(r.pred.galla.outflow, r.actual.outflow)));
  const gIn = mean(rows.map((r) => ape(r.pred.galla.inflow, r.actual.inflow)));
  const aIn = mean(rows.map((r) => ape(r.pred.avg3.inflow, r.actual.inflow)));
  const lower = rows.filter((r) => r.pred.galla.inflow < r.pred.avg3.inflow - 0.5);
  out.push(
    lower.length
      ? `- **The conservative income rule (D9) lowered the income forecast in ${lower.length} of ${rows.length} predictions** (it can only differ from a plain average with more than 3 months of history). Inflow error: ${pct(gIn)} for Galla vs ${pct(aIn)} for a plain 3-month average.`
      : `- The conservative income rule (D9) never went below the plain 3-month average here, so it made no difference in this data.`,
  );
  out.push(
    over.length > rows.length / 2
      ? `- **The next month's closing balance was overstated in ${over.length} of ${rows.length} predictions.** Outflow was under-forecast by ${signed(outBias).replace('−', '')} on average: spending in these files rises over time, and an average of past months lags behind. Overstating the balance is the risky direction for a shop owner.`
      : over.length > rows.length / 3
        ? `- The next month's closing balance was overstated in ${over.length} of ${rows.length} predictions: about as often too high as too low, so it is not reliably on the safe side yet.`
        : `- The next month's closing balance was overstated in only ${over.length} of ${rows.length} predictions, so the forecast is mostly on the safe side.`,
  );
  out.push(
    '- **Why one month (D19):** every forecast month used the same averages, so months 2 and 3 only repeated month 1. Big quarterly payments beyond next month are shown as a separate "Coming up" alert instead.',
  );
  return out;
}

function table(header: string[], rows: string[][]): string {
  return [`| ${header.join(' | ')} |`, `|${header.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.join(' | ')} |`)].join('\n');
}

it('forecast backtest -> docs/forecast_results.md', () => {
  const files = readdirSync(join(ROOT, 'data/synthetic')).filter((f) => f.endsWith('.csv') && !EXCLUDED.has(f)).sort();
  const rows = files.flatMap(backtest);
  const methods = Object.keys(METHODS) as Method[];
  const avg = (fn: (r: Row) => number, rs = rows) => mean(rs.map(fn));

  const summary = methods.map((m) => [
    METHODS[m],
    pct(avg((r) => ape(r.pred[m].inflow, r.actual.inflow))),
    signed(avg((r) => err(r.pred[m].inflow, r.actual.inflow))),
    pct(avg((r) => ape(r.pred[m].outflow, r.actual.outflow))),
    signed(avg((r) => err(r.pred[m].outflow, r.actual.outflow))),
    signed(avg((r) => err(r.pred[m].endBalance, r.actual.endBalance))),
    `${rows.filter((r) => r.pred[m].endBalance <= r.actual.endBalance).length} of ${rows.length}`,
  ]);
  const byHistory = ORIGINS.map((k) => {
    const rs = rows.filter((r) => r.history === k);
    return [
      `${k} months → month ${k + 1} (${monthLabel(rs[0]!.month, true)})`,
      ...methods.flatMap((m) => [pct(avg((r) => ape(r.pred[m].inflow, r.actual.inflow), rs)), pct(avg((r) => ape(r.pred[m].outflow, r.actual.outflow), rs))]),
    ];
  });
  const perFile = files.map((f) => {
    const rs = rows.filter((r) => r.file === f);
    return [
      f.replace('.csv', ''),
      ...methods.flatMap((m) => [pct(avg((r) => ape(r.pred[m].inflow, r.actual.inflow), rs)), pct(avg((r) => ape(r.pred[m].outflow, r.actual.outflow), rs))]),
    ];
  });

  const md = [
    '# Forecast backtest (next month)',
    '',
    `- **Date:** ${localDate()}`,
    '- **Command:** `npm run eval:forecast`',
    `- **Data:** ${files.length} synthetic statements in \`data/synthetic/\` (${[...EXCLUDED].map((f) => `\`${f}\``).join(', ')} excluded)`,
    `- **Method:** the app forecasts next month only (D19). Rolling test: give it months 1..k and predict month k+1, for k = ${ORIGINS.join(', ')}, so ${rows.length} predictions (${ORIGINS.length} per file), each compared with what actually happened. Categories from rules only, so nothing from the predicted month leaks in.`,
    '- **MAPE** = average of |forecast − actual| ÷ actual. **Bias** = average signed error: negative means the forecast was lower than reality.',
    '',
    '> Synthetic statements only, not a real-world score. Each file follows a scripted pattern (stable, growth, one loss month, volatile…), so real statements will be noisier.',
    '',
    '## Summary (average over all predictions)',
    '',
    table(['Method', 'Inflow MAPE', 'Inflow bias', 'Outflow MAPE', 'Outflow bias', 'Closing balance error', 'Balance not overstated'], summary),
    '',
    '## Findings',
    '',
    ...findings(rows),
    '',
    '## MAPE by amount of history',
    '',
    table(['History → predicted', ...methods.flatMap((m) => [`${METHODS[m]}: inflow`, 'outflow'])], byHistory),
    '',
    '## MAPE per file (average of its predictions)',
    '',
    table(['File', ...methods.flatMap((m) => [`${METHODS[m]}: inflow`, 'outflow'])], perFile),
    '',
  ].join('\n');
  writeFileSync(join(ROOT, 'docs/forecast_results.md'), md);
  console.log(md);
});
