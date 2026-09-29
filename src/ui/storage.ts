/* localStorage wrapper. Storage can be missing or blocked (private mode), so every call is guarded
   and the app works without it. Only owner corrections and the theme are stored. */
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
      /* storage unavailable: the change still applies for this visit */
    }
  },
};
