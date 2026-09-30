import { useCallback, useEffect, useState } from 'react';

/* Hash routes (#/budget) so the back button and reloads work on a static host with no server. */
export const PAGES = ['overview', 'cashflow', 'budget', 'recurring', 'transactions', 'statement', 'business'] as const;
export type Page = (typeof PAGES)[number];

const isPage = (s: string): s is Page => (PAGES as readonly string[]).includes(s);
const fromHash = (): Page => {
  const h = window.location.hash.replace(/^#\/?/, '');
  return isPage(h) ? h : 'overview';
};

export function useRoute(): [Page, (p: Page) => void] {
  const [page, setPage] = useState<Page>(fromHash);
  useEffect(() => {
    const on = () => setPage(fromHash());
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  const go = useCallback((p: Page) => {
    if (p !== fromHash()) window.location.hash = `/${p}`;
    setPage(p);
    window.scrollTo({ top: 0 });
  }, []);
  return [page, go];
}
