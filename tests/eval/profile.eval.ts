/* Does the business setup (named payees) help categorise a statement from the first upload?
   Run: npm run eval:profile   -> writes docs/profile_results.md

   Method: for each synthetic statement, simulate what an owner would enter at setup from months 1-3
   (payees they pay regularly: seen in 2+ months), then score only months 4-6, so the setup is never
   built from the rows it is scored on. Money out only (setup payees never match money in).
   No model: public/model.json was trained on these same synthetic files, so it would inflate every score. */
import { writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { it } from 'vitest';
import { enrich, parseCSV, type CategoryId, type ExpenseCategory, type RawTxn, type Txn } from '../../src/engine';
import type { PayeeRole, PayeeRule } from '../../src/engine/profile';
import { ROOT, readText } from '../helpers';

const EXCLUDED = new Set(['CHANGELOG.csv', 'hdfc_kirana_bengaluru_v1.csv']); // docs/decisions.md D8
const SETUP_MONTHS = 3;
const MIN_MONTHS_SEEN = 2;

/** Categories an owner can name payees for at setup, and the role they would pick. */
const ROLE_FOR: Partial<Record<CategoryId, PayeeRole>> = {
  salary: 'employee',
  rent: 'landlord',
  suppliers: 'supplier',
  emi: 'lender',
  utilities: 'utility',
};

type Condition = 'rules' | 'both' | 'setup';
const CONDITIONS: Record<Condition, string> = {
  rules: 'A. Keyword rules only (cold start today)',
  both: 'B. Setup payees + keyword rules (new)',
  setup: 'C. Setup payees only (statement with no keywords)',
};

interface Labelled {
  raw: RawTxn;
  label: CategoryId;
  hard: boolean;
}

const monthOfIso = (iso: string) => Number(iso.slice(0, 4)) * 12 + Number(iso.slice(5, 7)) - 1;
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};
const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const f2 = (x: number) => x.toFixed(3);
const localDate = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

function load(file: string): Labelled[] {
  const [header, ...rows] = parseCSV(readText(`data/synthetic/${file}`));
  const col = (name: string) => header!.findIndex((h) => String(h).trim() === name);
  const [iDate, iNar, iW, iD, iB, iCat, iHard] = ['date', 'narration', 'withdrawal', 'deposit', 'balance', 'category', 'hard_case'].map(col);
  const num = (v: unknown) => (v === '' || v === undefined || v === null ? 0 : Number(v));
  return rows
    .filter((r) => r.length > 3 && r[iDate!])
    .map((r, order) => {
      const withdrawal = num(r[iW!]);
      const raw: RawTxn = {
        date: String(r[iDate!]),
        narration: String(r[iNar!]),
        withdrawal,
        deposit: num(r[iD!]),
        balance: r[iB!] === '' ? null : num(r[iB!]),
        order,
      };
      let label = String(r[iCat!]) as CategoryId;
      if (withdrawal > 0 && label === 'sales') label = 'other'; // reversal of a sale: docs/decisions.md D7
      return { raw, label, hard: String(r[iHard!] ?? '0') === '1' };
    });
}

/* Words that describe the payment, not who it went to. An owner types a person's or firm's name
   ("Rajesh K"), never "Salary" or "Shop Rent", so a narration made only of these words has no name
   the owner could give. Without this the simulation would hand the matcher keywords in disguise. */
const GENERIC = new Set(['SALARY', 'SAL', 'WAGES', 'STAFF', 'SHOP', 'RENT', 'LOAN', 'EMI', 'ELECTRICITY', 'BILL', 'PAYMENT', 'MONTHLY', 'ADVANCE']);
const RAIL_WORDS = /^(UPI|NEFT|IMPS|RTGS|NACH|ACH|ECS|DR|CR|P2A|P2M|TO|BY|TRF|TRANSFER)$/;

/** The name an owner could recognise in a narration (first segment with a real name), or null. */
function nameInNarration(narration: string): string | null {
  if (narration.includes('@')) return null; // a bare UPI id: nothing an owner would type as a name
  for (const seg of narration.toUpperCase().split(/[/|:-]+/)) {
    const words = seg.split(/\s+/).filter((w) => w && !/\d/.test(w) && !RAIL_WORDS.test(w));
    if (!words.length || words.every((w) => GENERIC.has(w))) continue;
    const name = words.filter((w) => !GENERIC.has(w)).join(' ');
    if (name.replace(/\s/g, '').length >= 3) return name.split(' ').map((w) => w[0] + w.slice(1).toLowerCase()).join(' ');
  }
  return null;
}

/** What the owner would type at setup: regular payees (2+ months) from the setup months, by a name visible in the statement. */
function simulateSetup(setupRows: Labelled[]): PayeeRule[] {
  const groups = new Map<string, { role: PayeeRole; name: string; months: Set<number>; amounts: number[]; days: number[] }>();
  for (const { raw, label } of setupRows) {
    const role = ROLE_FOR[label];
    if (!role || raw.withdrawal <= 0) continue;
    const name = nameInNarration(raw.narration);
    if (!name) continue; // no name an owner could recognise (e.g. "SHOP RENT", "ELECTRICITY BILL")
    const k = `${role}|${name}`;
    const g = groups.get(k) ?? { role, name, months: new Set(), amounts: [], days: [] };
    g.months.add(monthOfIso(raw.date));
    g.amounts.push(raw.withdrawal);
    g.days.push(Number(raw.date.slice(8, 10)));
    groups.set(k, g);
  }
  return [...groups.values()]
    .filter((g) => g.months.size >= MIN_MONTHS_SEEN)
    .map((g, i) => ({ id: `sim${i}`, role: g.role, name: g.name, amount: Math.round(median(g.amounts)), day: Math.round(median(g.days)), aliases: [] }));
}

interface Scored {
  label: CategoryId;
  pred: Txn;
  hard: boolean;
  file: string;
}

function run(files: string[]) {
  const out: Record<Condition, Scored[]> = { rules: [], both: [], setup: [] };
  const setups: { file: string; payees: PayeeRule[]; test: number }[] = [];
  for (const file of files) {
    const rows = load(file);
    const first = Math.min(...rows.map((r) => monthOfIso(r.raw.date)));
    const setupRows = rows.filter((r) => monthOfIso(r.raw.date) < first + SETUP_MONTHS);
    const test = rows.filter((r) => monthOfIso(r.raw.date) >= first + SETUP_MONTHS && r.raw.withdrawal > 0);
    const payees = simulateSetup(setupRows);
    setups.push({ file, payees, test: test.length });
    const byOrder = new Map(test.map((t) => [t.raw.order, t]));
    const score = (c: Condition, txns: Txn[]) => {
      for (const pred of txns) {
        const t = byOrder.get(pred.order);
        if (t) out[c].push({ label: t.label, pred, hard: t.hard, file });
      }
    };
    const raw = test.map((t) => t.raw);
    score('rules', enrich(raw));
    score('both', enrich(raw, {}, undefined, undefined, payees));
    score('setup', enrich(raw, {}, undefined, [], payees));
  }
  return { out, setups };
}

/** Rows left for review count as wrong: the owner still has to sort them by hand. */
function metrics(rows: Scored[]) {
  const auto = rows.filter((r) => r.pred.source !== 'review');
  const correct = auto.filter((r) => r.pred.category === r.label).length;
  const classes = [...new Set(rows.map((r) => r.label))].sort() as ExpenseCategory[];
  const perClass = classes.map((c) => {
    const tp = rows.filter((r) => r.label === c && r.pred.source !== 'review' && r.pred.category === c).length;
    const fp = rows.filter((r) => r.label !== c && r.pred.source !== 'review' && r.pred.category === c).length;
    const fn = rows.filter((r) => r.label === c).length - tp;
    const p = tp + fp ? tp / (tp + fp) : 0;
    const rc = tp + fn ? tp / (tp + fn) : 0;
    return { c, n: rows.filter((r) => r.label === c).length, f1: p + rc ? (2 * p * rc) / (p + rc) : 0 };
  });
  const hard = rows.filter((r) => r.hard);
  return {
    n: rows.length,
    coverage: auto.length / rows.length,
    precision: auto.length ? correct / auto.length : 0,
    accuracy: correct / rows.length,
    macroF1: perClass.reduce((s, x) => s + x.f1, 0) / perClass.length,
    perClass,
    hard: hard.length,
    hardAccuracy: hard.length ? hard.filter((r) => r.pred.source !== 'review' && r.pred.category === r.label).length / hard.length : 0,
  };
}

it('profile evaluation', () => {
  const files = readdirSync(join(ROOT, 'data/synthetic'))
    .filter((f) => f.endsWith('.csv') && !EXCLUDED.has(f))
    .sort();
  const { out, setups } = run(files);
  const m = Object.fromEntries((Object.keys(CONDITIONS) as Condition[]).map((c) => [c, metrics(out[c])])) as Record<Condition, ReturnType<typeof metrics>>;
  const payeeCount = setups.reduce((s, x) => s + x.payees.length, 0);

  // Where the setup changed the answer, and whether for the better.
  const pairs = out.both.map((b, i) => ({ b, a: out.rules[i]! }));
  const changed = pairs.filter(({ a, b }) => a.pred.category !== b.pred.category || (a.pred.source === 'review') !== (b.pred.source === 'review'));
  const credited = pairs.filter(({ a, b }) => a.pred.source === 'rule' && b.pred.source === 'profile' && a.pred.category === b.pred.category);
  const fixed = changed.filter(({ a, b }) => b.pred.category === b.label && !(a.pred.source !== 'review' && a.pred.category === a.label));
  const broke = changed.filter(({ a, b }) => a.pred.source !== 'review' && a.pred.category === a.label && b.pred.category !== b.label);

  const lines: string[] = [
    '# Business setup (named payees): does it help the first upload?',
    '',
    `- **Date:** ${localDate()}`,
    '- **Command:** `npm run eval:profile`',
    `- **Data:** ${files.length} synthetic statements in \`data/synthetic/\` (\`CHANGELOG.csv\`, \`hdfc_kirana_bengaluru_v1.csv\` excluded, D8)`,
    `- **Test rows:** ${m.rules.n.toLocaleString('en-IN')} withdrawals from months 4-6 (money out only: setup payees never match money in). Of these, ${m.rules.hard} are marked \`hard_case\`.`,
    `- **Simulated setup:** from months 1-3 only, every payee an owner would name (salary, rent, EMI, bills, suppliers) that was paid in ${MIN_MONTHS_SEEN}+ different months, by a name visible in the statement. ${payeeCount} payees across ${files.length} files.`,
    '- **Names:** the simulated owner types the name visible in the narration (`SALARY/RAJESH K/UPI` → "Rajesh K"). Payments whose narration shows no name (`SHOP RENT`, `ELECTRICITY BILL`, a bare UPI id) get no setup payee, because a real owner’s spelling could not match them either.',
    '- **No model** in any condition: `public/model.json` was trained on these same files, so it would inflate every number.',
    '- **Rows left for review count as wrong** in accuracy and F1 (the owner still has to sort them by hand).',
    '',
    '> Synthetic validation only, not a real-world score. Synthetic narrations are keyword-friendly (SALARY/, SHOP RENT, LOAN EMI, …), and the simulated owner spells names exactly as the bank does (real owners will write "Rajesh Kumar" where the bank prints "RAJESH K"; the matcher handles initials and truncation, but not nicknames). Condition C is the closer stand-in for real statements where payments to people carry no keyword.',
    '',
    '## Summary',
    '',
    '| Condition | Sorted automatically | Correct when sorted | Accuracy (review = wrong) | Macro-F1 | Hard cases correct |',
    '|---|---|---|---|---|---|',
    ...(Object.keys(CONDITIONS) as Condition[]).map(
      (c) => `| ${CONDITIONS[c]} | ${pct(m[c].coverage)} | ${pct(m[c].precision)} | ${pct(m[c].accuracy)} | ${f2(m[c].macroF1)} | ${pct(m[c].hardAccuracy)} |`,
    ),
    '',
    '## What changed between A and B',
    '',
    `- **${changed.length}** of ${m.rules.n} test rows got a different category (or left "needs review") once the setup was added.`,
    `- **${credited.length}** more kept the same category, now decided by the setup payee instead of a keyword rule.`,
    `- **${fixed.length}** went from wrong or "needs review" to correct; **${broke.length}** went from correct to wrong.`,
    ...(fixed.length ? ['', 'Examples fixed by the setup:', '', ...fixed.slice(0, 6).map(({ a, b }) => `- \`${b.pred.narration}\`: ${a.pred.source === 'review' ? 'needs review' : `${a.pred.category} (${a.pred.source})`} → **${b.pred.category}** (${b.label} expected)`)] : []),
    ...(broke.length ? ['', 'Examples made worse:', '', ...broke.slice(0, 6).map(({ a, b }) => `- \`${b.pred.narration}\`: ${a.pred.category} → **${b.pred.category}** (${b.label} expected)`)] : []),
    '',
    '## Per-class F1',
    '',
    `| Class | Test rows | ${(Object.keys(CONDITIONS) as Condition[]).map((c) => CONDITIONS[c].split('.')[0]).join(' | ')} |`,
    `|---|---|${(Object.keys(CONDITIONS) as Condition[]).map(() => '---').join('|')}|`,
    ...m.rules.perClass.map(
      (pc, i) => `| ${pc.c} | ${pc.n} | ${(Object.keys(CONDITIONS) as Condition[]).map((c) => f2(m[c].perClass[i]!.f1)).join(' | ')} |`,
    ),
    '',
    '`other` and `personal` have no setup role (the setup does not ask about them), so C cannot score them; `tax` and `charges` are covered by keyword rules.',
    '',
    '## Setup payees per file',
    '',
    '| File | Payees named | Test rows |',
    '|---|---|---|',
    ...setups.map((s) => `| ${s.file.replace(/\.csv$/, '')} | ${s.payees.length} (${s.payees.map((p) => p.name).join(', ')}) | ${s.test} |`),
    '',
  ];
  writeFileSync(join(ROOT, 'docs/profile_results.md'), lines.join('\n'));
  console.log(lines.slice(12, 18).join('\n'));
});
