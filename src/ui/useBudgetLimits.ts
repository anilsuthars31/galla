/* The owner's own monthly budget amounts (category -> ₹). Galla suggests a budget from the statement;
   these are the categories the owner changed. Guests: kept in this browser. Account holders: saved to
   the account, shown at once, rolled back with a message if saving fails (same as useOverrides). */
import { useCallback, useEffect, useRef, useState } from 'react';
import { EXPENSE_CATEGORIES, type BudgetLimits, type ExpenseCategory } from '../engine';
import { api } from '../api/client';
import { store } from './storage';

const GUEST_KEY = 'galla-budget';

function readLocal(): BudgetLimits {
  const saved = store.get<Record<string, unknown>>(GUEST_KEY) ?? {};
  const out: BudgetLimits = {};
  for (const c of EXPENSE_CATEGORIES) {
    const v = saved[c];
    if (typeof v === 'number' && Number.isInteger(v) && v >= 0) out[c] = v;
  }
  return out;
}

export function useBudgetLimits(accountId: string | null, fromServer: BudgetLimits | undefined, onSaveError: (message: string) => void) {
  const [limits, setState] = useState<BudgetLimits>(() => (accountId ? (fromServer ?? {}) : readLocal()));
  const current = useRef(limits);
  current.current = limits;

  useEffect(() => {
    if (!accountId) store.set(GUEST_KEY, limits);
  }, [accountId, limits]);

  const save = useCallback(
    (category: ExpenseCategory, amount: number | null) => {
      const before = current.current;
      const next = { ...before };
      if (amount === null) delete next[category];
      else next[category] = amount;
      setState(next);
      if (!accountId) return;
      const call = amount === null ? api.resetBudgetLimit(category) : api.setBudgetLimit(category, amount);
      call.catch(() => {
        setState(before);
        onSaveError('Couldn’t save your budget. Check your internet connection and try again.');
      });
    },
    [accountId, onSaveError],
  );

  /** Set the owner's amount for a category; `null` goes back to Galla's suggestion. */
  return { limits, setLimit: save };
}
