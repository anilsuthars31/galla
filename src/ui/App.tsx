import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CATEGORIES,
  correctionsCsv,
  countCorrections,
  formatDate,
  buildProfileMatcher,
  friendlyError,
  payeeCandidates,
  PAYEE_ROLES,
  processStatement,
  rowsToTxns,
  sampleStatementRows,
  type CategoryId,
  type LoadedClassifier,
  type MonthIndex,
  type PayeeCandidate,
  type RawTxn,
  type Txn,
} from '../engine';
import { store } from './storage';
import { savedStatement } from './savedStatement';
import type { ThemePref } from './theme';
import { downloadText, loadModel, readStatementFile } from './fileio';
import { monthViews } from './model';
import { useRoute, type Page } from './route';
import { Sidebar, Logo, ThemeButton, AccountButton } from './components/Sidebar';
import { PageHeader } from './components/PageHeader';
import { Overview } from './pages/Overview';
import { CashFlow } from './pages/CashFlow';
import { Statement } from './pages/Statement';
import { Home, NoStatement } from './pages/Home';
import { BusinessPage, type Profile } from './pages/BusinessPage';
import { BudgetPlan } from './components/BudgetPlan';
import { RecurringList } from './components/RecurringList';
import { Ledger, type LedgerFilter } from './components/Ledger';
import { Toast, type ToastMessage } from './components/Toast';
import { WhoAreThese, type Answer } from './components/WhoAreThese';
import { useOverrides } from './useOverrides';
import { useBudgetLimits } from './useBudgetLimits';
import { api, ApiError } from '../api/client';
import { DropOverlay, useFileDrop } from './components/DropOverlay';

export interface Source {
  kind: 'sample' | 'file';
  name: string;
}

interface Data {
  raw: RawTxn[];
  source: Source;
}

const TITLES: Record<Page, string> = {
  overview: 'Overview',
  cashflow: 'Cash flow',
  budget: 'Budget',
  recurring: 'Recurring payments',
  transactions: 'Transactions',
  statement: 'Statement',
  business: 'Your business',
};

/** What each data page shows, for its "no statement yet" message. */
const NEEDS_DATA: Partial<Record<Page, string>> = {
  cashflow: 'money in and out month by month, and next month’s forecast',
  budget: 'a budget for next month, built from your history',
  recurring: 'your recurring payments',
  transactions: 'your transactions',
};

const EMPTY_FILTER: LedgerFilter = { q: '', cat: '', month: null, review: false };

/** "Who are these?" answers the owner put off, kept on this device (per account; guests share one list). */
const dismissedKey = (accountId: string | null) => `galla-dismissed:${accountId ?? 'guest'}`;

const loadSample = (): Data => ({
  raw: rowsToTxns(sampleStatementRows()),
  source: { kind: 'sample', name: 'Sharma Kirana & General Store (fictional)' },
});

/** Guests see the sample; an owner sees their remembered statement, or nothing until they upload one. */
function initialData(accountId: string | null): Data | null {
  if (!accountId) return loadSample();
  const s = savedStatement.load(accountId);
  return s ? { raw: s.raw, source: { kind: 'file', name: s.name } } : null;
}

interface Props {
  /** null in guest mode (sample data, no account). */
  profile: Profile | null;
  onProfile: (p: Profile) => void;
  onLogOut: () => void;
  /** Guest mode: leave for the welcome page to log in or sign up. */
  onSignIn: () => void;
  themePref: ThemePref;
  onTheme: () => void;
}

export function App({ profile, onProfile, onLogOut, onSignIn, themePref: pref, onTheme: cycle }: Props) {
  const [page, go] = useRoute();
  const accountId = profile?.account.id ?? null;

  const [data, setData] = useState<Data | null>(() => initialData(accountId));
  const [selected, setSelected] = useState<MonthIndex | null>(null);
  const [filter, setFilter] = useState<LedgerFilter>(EMPTY_FILTER);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [flashKey, setFlashKey] = useState<{ key: string; n: number } | null>(null);
  const [dismissed, setDismissed] = useState<string[]>(() => store.get<string[]>(dismissedKey(accountId)) ?? []);

  const notify = useCallback((message: string, action?: ToastMessage['action']) => {
    setToast({ id: Date.now(), message, action });
  }, []);
  const { overrides, set: setOverride, replace: replaceOverrides } = useOverrides(accountId, profile?.corrections, notify);
  const { limits, setLimit } = useBudgetLimits(accountId, profile?.limits, notify);

  const [classifier, setClassifier] = useState<LoadedClassifier | null>(null);
  useEffect(() => {
    let live = true;
    loadModel().then((m) => live && setClassifier(m));
    return () => {
      live = false;
    };
  }, []);

  const payees = profile?.payees;
  const processed = useMemo(
    () => (data ? processStatement(data.raw, overrides, classifier ?? undefined, payees ?? [], limits) : null),
    [data, overrides, classifier, payees, limits],
  );
  const txns = processed?.txns ?? null;
  const analysis = processed?.analysis ?? null;
  const months = useMemo(() => (analysis ? monthViews(analysis) : []), [analysis]);
  const reviewCount = useMemo(() => txns?.filter((t) => t.source === 'review').length ?? 0, [txns]);
  const lastActual = analysis?.months[analysis.months.length - 1]?.month ?? 0;
  const sel = selected !== null && months.some((m) => m.month === selected) ? selected : lastActual;
  const showHome = !data && profile !== null && page === 'overview';
  const candidates = useMemo(() => (txns ? payeeCandidates(txns).filter((c) => !dismissed.includes(c.key)) : []), [txns, dismissed]);
  const title = showHome ? 'Welcome' : TITLES[page];

  useEffect(() => store.set(dismissedKey(accountId), dismissed), [accountId, dismissed]);
  useEffect(() => {
    document.title = `${title} · Galla`;
  }, [title]);

  const openFile = useCallback(
    async (file: File) => {
      setError(null);
      setBusy(true);
      try {
        const raw = await readStatementFile(file);
        setData({ raw, source: { kind: 'file', name: file.name } });
        if (accountId) savedStatement.save(accountId, { name: file.name, raw });
        setSelected(null);
        setFilter(EMPTY_FILTER);
        go('overview');
        notify(`Loaded ${raw.length.toLocaleString('en-IN')} transactions from ${file.name}.`);
      } catch (err) {
        setError(friendlyError(err));
        // Owners without a statement keep seeing Home, where the upload and the error both are.
        if (data || !profile) go('statement');
      } finally {
        setBusy(false);
      }
    },
    [notify, go, accountId, data, profile],
  );

  const dragging = useFileDrop(openFile);

  const showSample = () => {
    setError(null);
    setData(loadSample());
    setSelected(null);
    setFilter(EMPTY_FILTER);
    go('overview');
    notify('Sample statement loaded.');
  };

  const forgetStatement = () => {
    if (!accountId) return;
    savedStatement.clear(accountId);
    setData(null);
    setSelected(null);
    setFilter(EMPTY_FILTER);
    go('overview');
    notify('Statement removed from this device.');
  };

  const recategorize = (t: Txn, category: CategoryId) => {
    const before = overrides;
    setOverride(t.key, category);
    const n = txns?.filter((x) => x.key === t.key).length ?? 1;
    setFlashKey((f) => ({ key: t.key, n: (f?.n ?? 0) + 1 }));
    notify(`${n} payment${n > 1 ? 's' : ''} ${t.dir === 'C' ? 'from' : 'to'} ${t.payee} moved to ${CATEGORIES[category].name}.`, {
      label: 'Undo',
      run: () => replaceOverrides(before),
    });
  };

  const resetCorrections = () => {
    const before = overrides;
    replaceOverrides({});
    notify('Categories reset to the automatic rules.', { label: 'Undo', run: () => replaceOverrides(before) });
  };

  const exportCorrections = () => {
    if (!txns) return;
    const d = new Date();
    const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    downloadText(`galla-corrections-${stamp}.csv`, correctionsCsv(txns));
    const n = countCorrections(txns);
    notify(`Exported ${n} corrected transaction${n > 1 ? 's' : ''}.`);
  };

  /* "Who are these?" answers. A role (employee, landlord, ...) becomes a setup payee, so salary/rent/EMI
     keep the usual-amount check (tea money to an employee stays out of salary). If the saved name would
     not match this payee's narrations, a plain correction is added so the answer still applies. */
  const answerCandidate = async (c: PayeeCandidate, a: Answer) => {
    const category = 'role' in a ? PAYEE_ROLES[a.role].category : a.category;
    const n = txns?.filter((x) => x.key === c.key).length ?? c.count;
    const moved = `${n} payment${n > 1 ? 's' : ''} to ${c.payee} moved to ${CATEGORIES[category].name}.`;
    if (!('role' in a) || !profile) {
      setOverride(c.key, category);
      notify(moved);
      return;
    }
    try {
      const p = await api.addPayee({ role: a.role, name: c.payee, amount: c.amount, day: c.day, aliases: [] });
      onProfile({ ...profile, payees: [...profile.payees, p] });
      const sample = txns?.find((x) => x.key === c.key);
      if (sample && !buildProfileMatcher([p])(sample.narration, 'D', c.amount)) setOverride(c.key, category);
      // No count here: the setup payee also picks up spelling variants and leaves out odd amounts, so
      // the rows that move are not simply the ones grouped under this payee a moment ago.
      notify(`${c.payee} saved as ${PAYEE_ROLES[a.role].label.toLowerCase()}. Their regular payments now count as ${CATEGORIES[category].name}.`);
    } catch (e) {
      notify(e instanceof ApiError ? e.message : 'Couldn’t save that. Please try again.');
    }
  };

  const dismissCandidate = (c: PayeeCandidate) => setDismissed((d) => [...d, c.key]);

  const showInLedger = (cat: CategoryId, month: MonthIndex) => {
    setFilter({ q: '', cat, month, review: false });
    go('transactions');
  };

  const showReview = () => {
    setFilter({ ...EMPTY_FILTER, review: true });
    go('transactions');
  };

  const periodSub =
    data && analysis && txns ? (
      <>
        {data.source.kind === 'sample' && (
          <span className="pill sample">
            <span className="dot" />
            Sample data
          </span>
        )}
        <span>
          {formatDate(analysis.period.from)} – {formatDate(analysis.period.to)} · {txns.length.toLocaleString('en-IN')} transactions
        </span>
      </>
    ) : null;

  const sub =
    page === 'statement'
      ? 'Choose the bank statement Galla should plan from.'
      : page === 'business'
        ? 'What Galla knows about your shop. It uses this to sort your payments.'
        : periodSub;

  const noData = (what: string) => <NoStatement what={what} onUpload={() => go('overview')} />;

  return (
    <div className="shell">
      <a className="skip" href="#main">
        Skip to content
      </a>
      <div className="mobile-top">
        <Logo />
        <b>Galla</b>
        <span className="grow" />
        <ThemeButton pref={pref} onTheme={cycle} />
        <AccountButton profile={profile} onOpen={() => go('business')} onSignIn={onSignIn} />
      </div>
      <Sidebar
        page={page}
        onNavigate={go}
        source={data?.source ?? null}
        review={reviewCount}
        themePref={pref}
        onTheme={cycle}
        profile={profile}
        onSignIn={onSignIn}
      />

      <main className="content" id="main" key={page}>
        {!showHome && (
          <PageHeader title={title} sub={sub}>
            {data &&
              page !== 'statement' &&
              page !== 'business' &&
              (reviewCount > 0 ? (
                <button className="chip review-jump" onClick={showReview} title="Show the transactions that need you to pick a category">
                  {reviewCount.toLocaleString('en-IN')} need review
                </button>
              ) : (
                <span className="chip static all-done" title="Every transaction got a category from your changes, a keyword rule or the model">
                  ✓ All categorised
                </span>
              ))}
          </PageHeader>
        )}

        {showHome && profile && (
          <Home profile={profile} error={error} onCloseError={() => setError(null)} onFile={(f) => void openFile(f)} onNavigate={go} />
        )}

        {!data && NEEDS_DATA[page] && noData(NEEDS_DATA[page]!)}

        {analysis && txns && (
          <>
            {page === 'overview' && <WhoAreThese candidates={candidates} onAnswer={answerCandidate} onDismiss={dismissCandidate} />}
            {page === 'overview' && (
              <Overview
                analysis={analysis}
                months={months}
                onNavigate={go}
                onShowCategory={showInLedger}
                onOpenMonth={(m) => {
                  setSelected(m);
                  go('cashflow');
                }}
              />
            )}
            {page === 'cashflow' && (
              <CashFlow analysis={analysis} months={months} selected={sel} onSelect={setSelected} onShowCategory={showInLedger} />
            )}
            {page === 'budget' && <BudgetPlan analysis={analysis} onSetLimit={setLimit} />}
            {page === 'recurring' && <RecurringList analysis={analysis} />}
            {page === 'transactions' && (
              <Ledger
                txns={txns}
                filter={filter}
                onFilter={setFilter}
                onRecategorize={recategorize}
                onExport={exportCorrections}
                onReset={resetCorrections}
                corrections={Object.keys(overrides).length}
                flashKey={flashKey}
                savedTo={profile ? 'account' : 'browser'}
              />
            )}
          </>
        )}

        {page === 'statement' && (
          <Statement
            current={data && analysis && txns ? { source: data.source, analysis, count: txns.length } : null}
            error={error}
            onCloseError={() => setError(null)}
            onFile={(f) => void openFile(f)}
            onSample={profile ? undefined : showSample}
            onForget={profile && data ? forgetStatement : undefined}
          />
        )}
        {page === 'business' &&
          (profile ? (
            <BusinessPage profile={profile} onChange={onProfile} onLogOut={onLogOut} notify={notify} />
          ) : (
            <section className="panel guest-card">
              <h2>You’re trying Galla with sample data</h2>
              <p className="muted">Create a free account to save your business details, so Galla can sort your own statement accurately.</p>
              <button className="btn primary" onClick={onSignIn}>
                Create an account
              </button>
            </section>
          ))}
      </main>

      {dragging && <DropOverlay />}
      {busy && (
        <div className="busy" role="status" aria-label="Reading the statement">
          <div className="spinner" />
        </div>
      )}
      {toast && <Toast toast={toast} onClose={() => setToast(null)} />}
    </div>
  );
}
