/* The owner's last statement, remembered in this browser only (never sent to the server), so they don't
   have to upload it on every visit. One per account; cleared on logout and by "Remove from this device". */
import type { RawTxn } from '../engine';
import { store } from './storage';

export interface SavedStatement {
  name: string;
  raw: RawTxn[];
}

const key = (accountId: string) => `galla-statement:${accountId}`;

const isIsoDate = (v: unknown) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
const isAmount = (v: unknown) => typeof v === 'number' && Number.isFinite(v) && v >= 0;

function isRawTxn(v: unknown): v is RawTxn {
  if (typeof v !== 'object' || v === null) return false;
  const t = v as Record<string, unknown>;
  return (
    isIsoDate(t.date) &&
    typeof t.narration === 'string' &&
    isAmount(t.withdrawal) &&
    isAmount(t.deposit) &&
    (t.balance === null || (typeof t.balance === 'number' && Number.isFinite(t.balance))) &&
    typeof t.order === 'number'
  );
}

/** Whatever came back from storage, if it is a usable statement; otherwise null (and it is ignored). */
export function parseSavedStatement(v: unknown): SavedStatement | null {
  if (typeof v !== 'object' || v === null) return null;
  const s = v as Record<string, unknown>;
  if (typeof s.name !== 'string' || !Array.isArray(s.raw) || s.raw.length === 0) return null;
  return s.raw.every(isRawTxn) ? { name: s.name, raw: s.raw } : null;
}

export const savedStatement = {
  load: (accountId: string) => parseSavedStatement(store.get<unknown>(key(accountId))),
  /** Best effort: if the browser has no room, the statement simply isn't remembered. */
  save: (accountId: string, s: SavedStatement) => store.set(key(accountId), s),
  clear: (accountId: string) => store.remove(key(accountId)),
};
