/* Setup-form rows <-> saved payees. Pure functions, so the form logic is testable without a browser. */
import { LIMITS, type PayeeInput, type PayeeRole, type PayeeRule } from '../engine/profile';

/** One editable row in the setup form. Numbers stay as typed text until saved. */
export interface PayeeDraft {
  /** Set when the row is already saved. */
  id?: string;
  /** Stable React key for new rows. */
  key: string;
  role: PayeeRole;
  name: string;
  amount: string;
  day: string;
  alias: string;
}

let seq = 0;
export const newDraft = (role: PayeeRole): PayeeDraft => ({ key: `new-${++seq}`, role, name: '', amount: '', day: '', alias: '' });

export const toDraft = (p: PayeeRule): PayeeDraft => ({
  id: p.id,
  key: p.id,
  role: p.role,
  name: p.name,
  amount: p.amount === null ? '' : String(p.amount),
  day: p.day === null ? '' : String(p.day),
  alias: p.aliases[0] ?? '',
});

/** "₹14,000", "14000", "14,000.00" -> 14000. Empty -> null. */
export function parseRupees(s: string): number | null | 'invalid' {
  const t = s.replace(/[₹,\s]|rs\.?/gi, '');
  if (!t) return null;
  if (!/^\d+(\.\d{1,2})?$/.test(t)) return 'invalid';
  const n = Math.round(Number(t));
  return n > 0 && n <= LIMITS.amountMax ? n : 'invalid';
}

function parseDay(s: string): number | null | 'invalid' {
  const t = s.trim();
  if (!t) return null;
  const n = Number(t);
  return Number.isInteger(n) && n >= 1 && n <= 31 ? n : 'invalid';
}

/** A draft as an API payload, or the sentence to show next to the row. Blank rows give null. */
export function draftToInput(d: PayeeDraft): { input: PayeeInput } | { error: string } | null {
  const name = d.name.trim();
  if (!name && !d.amount.trim() && !d.day.trim() && !d.alias.trim()) return null;
  if (!name) return { error: 'Add a name, or clear this row.' };
  if (name.length > LIMITS.nameMax) return { error: `Name is too long (at most ${LIMITS.nameMax} characters).` };
  const amount = parseRupees(d.amount);
  if (amount === 'invalid') return { error: 'Amount should be in rupees, like 14000.' };
  const day = parseDay(d.day);
  if (day === 'invalid') return { error: 'Day should be a date of the month, 1 to 31.' };
  const alias = d.alias.trim();
  return { input: { role: d.role, name, amount, day, aliases: alias ? [alias] : [] } };
}

export interface PayeePlan {
  create: PayeeInput[];
  update: { id: string; input: PayeeInput }[];
  remove: string[];
  /** Row key -> message. When non-empty, nothing should be saved. */
  errors: Record<string, string>;
}

const same = (a: PayeeInput, b: PayeeRule) =>
  a.role === b.role && a.name === b.name && a.amount === b.amount && a.day === b.day && a.aliases.join('\n') === b.aliases.join('\n');

/**
 * What to send so the saved payees for `roles` match the form rows.
 * Saved payees of other roles are left alone. Cleared rows that were saved are deleted.
 */
export function planPayees(saved: readonly PayeeRule[], drafts: readonly PayeeDraft[], roles: readonly PayeeRole[]): PayeePlan {
  const plan: PayeePlan = { create: [], update: [], remove: [], errors: {} };
  const kept = new Set<string>();
  for (const d of drafts) {
    const r = draftToInput(d);
    if (r === null) continue;
    if ('error' in r) {
      plan.errors[d.key] = r.error;
      continue;
    }
    const before = d.id ? saved.find((p) => p.id === d.id) : undefined;
    if (before) {
      kept.add(before.id);
      if (!same(r.input, before)) plan.update.push({ id: before.id, input: r.input });
    } else plan.create.push(r.input);
  }
  for (const p of saved) if (roles.includes(p.role) && !kept.has(p.id)) plan.remove.push(p.id);
  return plan;
}
