/* Matches a withdrawal to a payee the owner named at setup (employee, landlord, supplier, lender, bill).
   Pure and deterministic. Only money going out is matched: the same person can also be a customer. */
import { PAYEE_ROLES, type PayeeRule } from './profile';
import type { Direction, ExpenseCategory } from './types';

export interface ProfileMatch {
  payee: PayeeRule;
  category: ExpenseCategory;
}

export type ProfileMatcher = (narration: string, dir: Direction, amount: number) => ProfileMatch | null;

/** Words in an owner's spelling that banks leave out or that say nothing about who it is. */
const IGNORE = new Set(['MR', 'MRS', 'MS', 'SHRI', 'SMT', 'DR', 'THE', 'AND', 'CO', 'PVT', 'LTD', 'LIMITED', 'PRIVATE', 'LLP']);

const words = (s: string) =>
  s
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);

const ALIAS_MIN = 5;
const SINGLE_WORD_MIN = 4;
const JOINED_MIN = 6;
const TRUNCATED_MIN = 3;

interface Compiled {
  payee: PayeeRule;
  category: ExpenseCategory;
  tokens: string[];
  /** Spellings with the spaces removed, e.g. RAJESHKUMAR and RAJESHK, for narrations like SALARY/RAJESHK. */
  joined: string[];
  aliases: string[];
}

function compile(p: PayeeRule): Compiled | null {
  const cleaned = p.name.toUpperCase().replace(/^M\s*\/\s*S\b/, ' '); // "M/S Balaji Traders"
  const tokens = words(cleaned).filter((w) => !IGNORE.has(w) && !/^\d+$/.test(w));
  const aliases = p.aliases.map((a) => a.trim().toLowerCase()).filter((a) => a.length >= ALIAS_MIN);
  if (tokens.length === 1 && tokens[0]!.length < SINGLE_WORD_MIN && !aliases.length) return null;
  const joined: string[] = [];
  if (tokens.length >= 2) {
    const full = tokens.join('');
    const initial = tokens.slice(0, -1).join('') + tokens[tokens.length - 1]![0];
    for (const j of [full, initial]) if (j.length >= JOINED_MIN) joined.push(j);
  }
  return { payee: p, category: PAYEE_ROLES[p.role].category, tokens, joined, aliases };
}

/** How well the name matches the narration's words: 0 = no match, else a score (more words = higher). */
function nameScore(c: Compiled, w: readonly string[]): number {
  const { tokens } = c;
  if (!tokens.length) return 0;
  if (tokens.length === 1) {
    const t = tokens[0]!;
    return t.length >= SINGLE_WORD_MIN && w.includes(t) ? 10 : 0;
  }
  let exact = true;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i]!;
    if (w.includes(t) && (t.length > 1 || followsPrevious(w, tokens[i - 1], t))) continue;
    const last = i === tokens.length - 1;
    // Banks cut long names ("SURESH PAWA") or keep only an initial ("RAJESH K").
    const truncated = last && t.length > TRUNCATED_MIN && w.some((x) => x.length >= TRUNCATED_MIN && x.length < t.length && t.startsWith(x));
    const initial = last && followsPrevious(w, tokens[i - 1], t[0]!);
    if (!truncated && !initial) {
      // Joined spelling must be a whole word: RAJESHK matches SALARY/RAJESHK/UPI but not RAJESH KHANNA.
      return c.joined.some((j) => w.includes(j)) ? 10 * tokens.length : 0;
    }
    exact = false;
  }
  return 10 * tokens.length + (exact ? 5 : 0);
}

/** True when `word` appears right after `prev` in the narration. */
function followsPrevious(w: readonly string[], prev: string | undefined, word: string): boolean {
  if (!prev) return false;
  for (let i = 0; i < w.length - 1; i++) if (w[i] === prev && w[i + 1] === word) return true;
  return false;
}

/** Distance from the payee's typical amount (0 = same). Payees without one sit in the middle. */
const amountGap = (p: PayeeRule, amount: number) => (p.amount && amount > 0 ? Math.abs(Math.log(amount / p.amount)) : 1);

/* Salary, rent and EMI are fixed. A payment to the same person far from the usual amount (tea money,
   a personal transfer to an employee) is probably something else, so the setup steps aside and the
   rules, the model or the owner decide. Suppliers and bills vary, so they are never limited. */
const FIXED_ROLES = new Set<PayeeRule['role']>(['employee', 'landlord', 'lender']);
const FIXED_MIN = 0.4;
const FIXED_MAX = 2.5;
const plausibleAmount = (p: PayeeRule, amount: number) =>
  !FIXED_ROLES.has(p.role) || !p.amount || (amount >= p.amount * FIXED_MIN && amount <= p.amount * FIXED_MAX);

export function buildProfileMatcher(payees: readonly PayeeRule[]): ProfileMatcher {
  const compiled = payees.map(compile).filter((c): c is Compiled => c !== null);
  if (!compiled.length) return () => null;

  return (narration, dir, amount) => {
    if (dir !== 'D') return null;
    const lower = narration.toLowerCase();
    const w = words(narration);
    let best: { c: Compiled; score: number; gap: number } | null = null;
    for (const c of compiled) {
      if (!plausibleAmount(c.payee, amount)) continue;
      const score = c.aliases.some((a) => lower.includes(a)) ? 1000 : nameScore(c, w);
      if (!score) continue;
      const gap = amountGap(c.payee, amount);
      if (!best || score > best.score || (score === best.score && gap < best.gap)) best = { c, score, gap };
    }
    return best ? { payee: best.c.payee, category: best.c.category } : null;
  };
}
