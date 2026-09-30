import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CATEGORIES,
  correctionsCsv,
  countCorrections,
  formatDate,
  friendlyError,
  isCategoryId,
  processStatement,
  rowsToTxns,
  sampleStatementRows,
  type CategoryId,
  type LoadedClassifier,
  type MonthIndex,
  type Overrides,
  type RawTxn,
  type Txn,
} from '../engine';
import { store } from './storage';
import type { ThemePref } from './theme';
import { downloadText, loadModel, readStatementFile } from './fileio';
import { monthViews } from './model';
import { useRoute, type Page } from './route';
import { Sidebar, Logo, ThemeButton, AccountButton } from './components/Sidebar';
import { PageHeader } from './components/PageHeader';
import { Overview } from './pages/Overview';
import { CashFlow } from './pages/CashFlow';
import { Statement } from './pages/Statement';
import { BusinessPage, type Profile } from './pages/BusinessPage';
import { BudgetTable } from './components/BudgetTable';
import { RecurringList } from './components/RecurringList';
import { Ledger, type LedgerFilter } from './components/Ledger';
import { Toast, type ToastMessage } from './components/Toast';
import { DropOverlay, useFileDrop } from './components/DropOverlay';

export interface Source {
  kind: 'sample' | 'file';
  name: string;
}

const OVERRIDES_KEY = 'galla-overrides';
const TITLES: Record<Page, string> = {
  overview: 'Overview',
  cashflow: 'Cash flow',
  budget: 'Budget',
  recurring: 'Recurring payments',
  transactions: 'Transactions',
  statement: 'Statement',
  business: 'Your business',
};

const EMPTY_FILTER: LedgerFilter = { q: '', cat: '', month: null, review: false };

function loadOverrides(): Overrides {
  const saved = store.get<Record<string, unknown>>(OVERRIDES_KEY) ?? {};
  const out: Overrides = {};
  for (const [k, v] of Object.entries(saved)) if (isCategoryId(v)) out[k] = v;
  return out;
}

const loadSample = (): { raw: RawTxn[]; source: Source } => ({
  raw: rowsToTxns(sampleStatementRows()),
  source: { kind: 'sample', name: 'Sharma Kirana & General Store (fictional)' },
});

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

  const [data, setData] = useState(loadSample);
  const [overrides, setOverrides] = useState<Overrides>(loadOverrides);
  const [selected, setSelected] = useState<MonthIndex | null>(null);
  const [filter, setFilter] = useState<LedgerFilter>(EMPTY_FILTER);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [flashKey, setFlashKey] = useState<{ key: string; n: number } | null>(null);

  const [classifier, setClassifier] = useState<LoadedClassifier | null>(null);
  useEffect(() => {
    let live = true;
    loadModel().then((m) => live && setClassifier(m));
    return () => {
      live = false;
    };
  }, []);

  const { txns, analysis } = useMemo(
    () => processStatement(data.raw, overrides, classifier ?? undefined),
    [data.raw, overrides, classifier],
  );
  const months = useMemo(() => monthViews(analysis), [analysis]);
  const reviewCount = useMemo(() => txns.filter((t) => t.source === 'review').length, [txns]);
  const lastActual = analysis.months[analysis.months.length - 1]!.month;
  const sel = selected !== null && months.some((m) => m.month === selected) ? selected : lastActual;

  useEffect(() => store.set(OVERRIDES_KEY, overrides), [overrides]);
  useEffect(() => {
    document.title = `${TITLES[page]} · Galla`;
  }, [page]);

  const notify = useCallback((message: string, action?: ToastMessage['action']) => {
    setToast({ id: Date.now(), message, action });
  }, []);

  const openFile = useCallback(
    async (file: File) => {
      setError(null);
      setBusy(true);
      try {
        const raw = await readStatementFile(file);
        setData({ raw, source: { kind: 'file', name: file.name } });
        setSelected(null);
        setFilter(EMPTY_FILTER);
        go('overview');
        notify(`Loaded ${raw.length.toLocaleString('en-IN')} transactions from ${file.name}.`);
      } catch (err) {
        setError(friendlyError(err));
        go('statement');
      } finally {
        setBusy(false);
      }
    },
    [notify, go],
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

  const recategorize = (t: Txn, category: CategoryId) => {
    const before = overrides;
    const next = { ...overrides, [t.key]: category };
    setOverrides(next);
    const n = txns.filter((x) => x.key === t.key).length;
    setFlashKey((f) => ({ key: t.key, n: (f?.n ?? 0) + 1 }));
    notify(`${n} payment${n > 1 ? 's' : ''} ${t.dir === 'C' ? 'from' : 'to'} ${t.payee} moved to ${CATEGORIES[category].name}.`, {
      label: 'Undo',
      run: () => setOverrides(before),
    });
  };

  const resetCorrections = () => {
    const before = overrides;
    setOverrides({});
    notify('Categories reset to the automatic rules.', { label: 'Undo', run: () => setOverrides(before) });
  };

  const exportCorrections = () => {
    const d = new Date();
    const stamp = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    downloadText(`galla-corrections-${stamp}.csv`, correctionsCsv(txns));
    const n = countCorrections(txns);
    notify(`Exported ${n} corrected transaction${n > 1 ? 's' : ''}.`);
  };

  const showInLedger = (cat: CategoryId, month: MonthIndex) => {
    setFilter({ q: '', cat, month, review: false });
    go('transactions');
  };

  const showReview = () => {
    setFilter({ ...EMPTY_FILTER, review: true });
    go('transactions');
  };

  const sub = (
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
  );

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
        source={data.source}
        review={reviewCount}
        themePref={pref}
        onTheme={cycle}
        profile={profile}
        onSignIn={onSignIn}
      />

      <main className="content" id="main" key={page}>
        <PageHeader
          title={TITLES[page]}
          sub={
            page === 'statement'
              ? 'Choose the bank statement Galla should plan from.'
              : page === 'business'
                ? 'What Galla knows about your shop. It uses this to sort your payments.'
                : sub
          }
        >
          {page !== 'statement' &&
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

        {page === 'overview' && (
          <Overview
            analysis={analysis} months={months} onNavigate={go}
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
        {page === 'budget' && <BudgetTable analysis={analysis} />}
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
          />
        )}
        {page === 'statement' && (
          <Statement
            source={data.source}
            analysis={analysis}
            count={txns.length}
            error={error}
            onCloseError={() => setError(null)}
            onFile={(f) => void openFile(f)}
            onSample={showSample}
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
