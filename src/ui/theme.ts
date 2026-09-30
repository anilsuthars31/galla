import { useEffect, useState } from 'react';
import type { CategoryId } from '../engine';
import { store } from './storage';

/** CSS variable holding each category's colour. */
export const CAT_VAR: Record<CategoryId, string> = {
  sales: '--in',
  other_income: '--in-2',
  suppliers: '--s1',
  salary: '--s2',
  rent: '--s3',
  utilities: '--s4',
  emi: '--s5',
  tax: '--s6',
  personal: '--s7',
  charges: '--s8',
  other: '--s0',
};

export const catColor = (c: CategoryId) => `var(${CAT_VAR[c]})`;

export type ThemePref = 'system' | 'light' | 'dark';
export type Theme = 'light' | 'dark';

const darkQuery = () => window.matchMedia('(prefers-color-scheme: dark)');

function applyTheme(pref: ThemePref) {
  const root = document.documentElement;
  if (pref === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', pref);
  store.set('galla-theme', pref);
}

/** Theme preference (remembered in this browser) and the theme actually shown. */
export function useTheme() {
  const [pref, setPrefState] = useState<ThemePref>(() => {
    const saved = store.get<ThemePref>('galla-theme');
    const p = saved === 'light' || saved === 'dark' ? saved : 'system';
    applyTheme(p);
    return p;
  });
  const [systemDark, setSystemDark] = useState(() => darkQuery().matches);

  useEffect(() => {
    const q = darkQuery();
    const on = () => setSystemDark(q.matches);
    q.addEventListener('change', on);
    return () => q.removeEventListener('change', on);
  }, []);

  const theme: Theme = pref === 'system' ? (systemDark ? 'dark' : 'light') : pref;
  /** system -> the opposite of what is showing -> the other one, and so on. */
  const cycle = () => {
    const next: ThemePref = pref === 'system' ? (systemDark ? 'light' : 'dark') : pref === 'light' ? 'dark' : 'light';
    applyTheme(next);
    setPrefState(next);
  };
  return { pref, theme, cycle };
}
