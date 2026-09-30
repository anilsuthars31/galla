import type { PayeeRole, PayeeRule } from '../engine/profile';
import { api } from './client';
import { planPayees, type PayeeDraft } from './payeeDraft';

export type SaveResult = { ok: true; payees: PayeeRule[] } | { ok: false; errors: Record<string, string> };

/** Makes the saved payees for `roles` match the form rows. Returns the full, fresh payee list. */
export async function savePayees(saved: readonly PayeeRule[], drafts: readonly PayeeDraft[], roles: readonly PayeeRole[]): Promise<SaveResult> {
  const plan = planPayees(saved, drafts, roles);
  if (Object.keys(plan.errors).length) return { ok: false, errors: plan.errors };
  // Sequential on purpose: a few rows at most, and a failure leaves a clear partial state to retry from.
  for (const id of plan.remove) await api.deletePayee(id);
  for (const u of plan.update) await api.updatePayee(u.id, u.input);
  for (const c of plan.create) await api.addPayee(c);
  return { ok: true, payees: await api.payees() };
}
