/* localStorage wrapper. Storage can be missing or blocked (private mode), so every call is guarded
   and the app works without it. Stored: the theme, owner corrections and the owner's last statement
   (per account, see savedStatement.ts). */
export const store = {
  get<T>(key: string): T | null {
    try {
      const v = window.localStorage.getItem(key);
      return v ? (JSON.parse(v) as T) : null;
    } catch {
      return null;
    }
  },
  set(key: string, value: unknown): void {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      /* storage unavailable or full: the change still applies for this visit */
    }
  },
  remove(key: string): void {
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* nothing to remove */
    }
  },
};
