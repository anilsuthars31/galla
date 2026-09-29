import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CATEGORIES,
  correctionsCsv,
  countCorrections,
  friendlyError,
  isCategoryId,
  processStatement,
  rowsToTxns,
  sampleStatementRows,
  type CategoryId,
  type ExpenseCategory,
  type LoadedClassifier,
  type MonthIndex,
  type Overrides,
  type RawTxn,
  type Txn,
} from '../engine';
import { store } from './storage';
import { useReducedMotion, useTheme } from './theme';
import { downloadText, loadModel, readStatementFile } from './fileio';
import { monthViews } from './model';
import { Header } from './components/Header';
import { SourceBar, ErrorBanner } from './components/SourceBar';
import { SummaryCards } from './components/SummaryCards';
import { Stage } from './components/Stage';
import { MonthDetail } from './components/MonthDetail';
import { BalanceChart } from './components/BalanceChart';
import { Alerts } from './components/Alerts';
import { BudgetTable } from './components/BudgetTable';
import { RecurringList } from './components/RecurringList';
import { Ledger, type LedgerFilter } from './components/Ledger';
import { Toast, type ToastMessage } from './components/Toast';
import { DropOverlay, useFileDrop } from './components/DropOverlay';
import { Footer } from './components/Footer';

export interface Source {
  kind: 'sample' | 'file';
  name: string;
}

const OVERRIDES_KEY = 'galla-overrides';
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

export function App() {
  const { pref, theme, cycle } = useTheme();
  const reducedMotion = useReducedMotion();

  const [data, setData] = useState(loadSample);
  const [overrides, setOverrides] = useState<Overrides>(loadOverrides);
  const [selected, setSelected] = useState<MonthIndex | null>(null);
  const [hidden, setHidden] = useState<ReadonlySet<ExpenseCategory>>(new Set());
  const [filter, setFilter] = useState<LedgerFilter>(EMPTY_FILTER);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<ToastMessage | null>(null);
  const [flashKey, setFlashKey] = useState<{ key: string; n: number } | null>(null);
  const ledgerRef = useRef<HTMLElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

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
        setHidden(new Set());
        setFilter(EMPTY_FILTER);
        notify(`Loaded ${raw.length.toLocaleString('en-IN')} transactions from ${file.name}.`);
      } catch (err) {
        setError(friendlyError(err));
      } finally {
        setBusy(false);
      }
    },
    [notify],
  );

  const dragging = useFileDrop(openFile);

  const showSample = () => {
    setError(null);
    setData(loadSample());
    setSelected(null);
    setHidden(new Set());
    setFilter(EMPTY_FILTER);
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
    ledgerRef.current?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
  };

  const toggleCategory = (c: ExpenseCategory) =>
    setHidden((h) => {
      const next = new Set(h);
      if (next.has(c)) next.delete(c);
      else next.add(c);
      return next;
    });

  return (
    <>
      <Header themePref={pref} onTheme={cycle} onUpload={() => fileInput.current?.click()} onSample={showSample} isSample={data.source.kind === 'sample'} />
      <input
        ref={fileInput}
        type="file"
        accept=".csv,.xls,.xlsx,.xlsm,.txt,.pdf,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void openFile(f);
          e.target.value = '';
        }}
      />
      <main className="wrap" id="main">
        <SourceBar
          source={data.source}
          analysis={analysis}
          count={txns.length}
          review={reviewCount}
          onReview={() => {
            setFilter({ ...EMPTY_FILTER, review: true });
            ledgerRef.current?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
          }}
        />
        {error && <ErrorBanner message={error} onClose={() => setError(null)} />}

        <SummaryCards analysis={analysis} months={months} />

        <section className="grid-stage" aria-label="Month by month">
          <Stage
            months={months}
            selected={sel}
            onSelect={setSelected}
            hidden={hidden}
            onToggle={toggleCategory}
            theme={theme}
            reducedMotion={reducedMotion}
          />
          <MonthDetail months={months} selected={sel} onSelect={setSelected} onShowCategory={showInLedger} />
        </section>

        <section className="grid-plan" aria-label="Plan">
          <BalanceChart analysis={analysis} months={months} />
          <Alerts alerts={analysis.alerts} />
        </section>

        <section className="grid-two" aria-label="Budget and recurring payments">
          <BudgetTable analysis={analysis} />
          <RecurringList analysis={analysis} />
        </section>

        <Ledger
          ref={ledgerRef}
          txns={txns}
          filter={filter}
          onFilter={setFilter}
          onRecategorize={recategorize}
          onExport={exportCorrections}
          onReset={resetCorrections}
          corrections={Object.keys(overrides).length}
          flashKey={flashKey}
        />

        <Footer />
      </main>

      {dragging && <DropOverlay />}
      {busy && (
        <div className="busy" role="status" aria-label="Reading the statement">
          <div className="spinner" />
        </div>
      )}
      {toast && <Toast toast={toast} onClose={() => setToast(null)} />}
    </>
  );
}
