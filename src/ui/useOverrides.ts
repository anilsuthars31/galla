/* The owner's category corrections (payee key -> category).
   Guests: kept in this browser, as before accounts existed.
   Account holders: kept on the server so they follow the owner to any device. A change shows at once
   and is saved in the background; if saving fails it is rolled back and the owner is told. */
import { useCallback, useEffect, useRef, useState } from 'react';
import { isCategoryId, type CategoryId, type Overrides } from '../engine';
import { api } from '../api/client';
import { store } from './storage';

const GUEST_KEY = 'galla-overrides';
/** Where account holders' corrections lived on the device before they moved to the server (D16). */
const deviceKey = (accountId: string) => `galla-overrides:${accountId}`;

function readLocal(key: string): Overrides {
  const saved = store.get<Record<string, unknown>>(key) ?? {};
  const out: Overrides = {};
  for (const [k, v] of Object.entries(saved)) if (isCategoryId(v)) out[k] = v;
  return out;
}

export interface OverrideChanges {
  /** Remove everything in one call (the ledger's "undo my changes"). */
  clear: boolean;
  set: [string, CategoryId][];
  remove: string[];
}

/** What has to change on the server to turn `before` into `after`. Pure. */
export function diffOverrides(before: Overrides, after: Overrides): OverrideChanges {
  if (!Object.keys(after).length && Object.keys(before).length) return { clear: true, set: [], remove: [] };
  return {
    clear: false,
    set: Object.entries(after).filter(([k, v]) => before[k] !== v),
    remove: Object.keys(before).filter((k) => !(k in after)),
  };
}

function syncCalls(before: Overrides, after: Overrides): Promise<unknown>[] {
  const d = diffOverrides(before, after);
  if (d.clear) return [api.clearCorrections()];
  return [...d.set.map(([k, v]) => api.setCorrection(k, v)), ...d.remove.map((k) => api.deleteCorrection(k))];
}

export function useOverrides(accountId: string | null, fromServer: Overrides | undefined, onSaveError: (message: string) => void) {
  const [overrides, setState] = useState<Overrides>(() => (accountId ? (fromServer ?? {}) : readLocal(GUEST_KEY)));
  const current = useRef(overrides);
  current.current = overrides;

  // Guests: remember in this browser.
  useEffect(() => {
    if (!accountId) store.set(GUEST_KEY, overrides);
  }, [accountId, overrides]);

  // Account holders: move corrections still kept on this device to the account, once.
  useEffect(() => {
    if (!accountId) return;
    const local = readLocal(deviceKey(accountId));
    if (!Object.keys(local).length) return;
    let live = true;
    api
      .importCorrections(local)
      .then((merged) => {
        store.remove(deviceKey(accountId));
        if (live) setState(merged);
      })
      .catch(() => undefined); // stays on the device; tried again next time
    return () => {
      live = false;
    };
  }, [accountId]);

  /** Replace all corrections with `next` (used for set, undo and reset alike). */
  const replace = useCallback(
    (next: Overrides) => {
      const before = current.current;
      setState(next);
      if (!accountId) return;
      Promise.all(syncCalls(before, next)).catch(() => {
        setState(before);
        onSaveError('Couldn’t save that change to your account. Check your internet connection and try again.');
      });
    },
    [accountId, onSaveError],
  );

  const set = useCallback((key: string, category: CategoryId) => replace({ ...current.current, [key]: category }), [replace]);

  return { overrides, set, replace };
}
