import { Component, Suspense, lazy, useMemo, useState, type ReactNode } from 'react';
import { CATEGORIES, EXPENSE_CATEGORIES, type ExpenseCategory, type MonthIndex } from '../../engine';
import type { MonthView } from '../model';
import { catColor, type Theme } from '../theme';
import { Bars2D } from './Bars2D';
import { Icon } from './Icons';

/* three.js and friends are a separate chunk, loaded after the rest of the page. */
const CashCity = lazy(() => import('../city/CashCity'));

export function hasWebGL(): boolean {
  if (new URLSearchParams(window.location.search).has('no3d')) return false; // for testing the fallback
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch {
    return false;
  }
}

class Boundary extends Component<{ onError: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    this.props.onError();
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

interface Props {
  months: MonthView[];
  selected: MonthIndex;
  onSelect: (m: MonthIndex) => void;
  hidden: ReadonlySet<ExpenseCategory>;
  onToggle: (c: ExpenseCategory) => void;
  theme: Theme;
  reducedMotion: boolean;
}

export function Stage(props: Props) {
  const { months, hidden, onToggle } = props;
  const [webgl] = useState(hasWebGL);
  const [failed, setFailed] = useState(false);
  const present = useMemo(() => EXPENSE_CATEGORIES.filter((c) => months.some((m) => (m.byCategory[c] ?? 0) > 0)), [months]);
  const use3d = webgl && !failed;

  return (
    <div className="panel city section-enter">
      <div className="phead">
        <div>
          <h2>Money in and out, month by month</h2>
          <p>Solid towers are actual months, glass towers the 3-month forecast. Click a tower or a month to see its detail.</p>
        </div>
      </div>

      {use3d ? (
        <Boundary onError={() => setFailed(true)}>
          <Suspense fallback={<CityLoading />}>
            <CashCity {...props} onContextLost={() => setFailed(true)} />
          </Suspense>
        </Boundary>
      ) : (
        <>
          <Bars2D {...props} />
          <p className="nogl">
            <Icon.cube />
            The 3D view is off because this browser can’t run WebGL. This chart and the month panel show the same numbers.
          </p>
        </>
      )}

      <div className="legend" aria-label="Categories: click to show or hide in the chart">
        <span className="chip static">
          <span className="sw" style={{ background: 'var(--in)' }} />
          Money in
        </span>
        {present.map((c) => (
          <button key={c} className="chip" aria-pressed={!hidden.has(c)} onClick={() => onToggle(c)}>
            <span className="sw" style={{ background: catColor(c) }} />
            {CATEGORIES[c].name}
          </button>
        ))}
      </div>
    </div>
  );
}

function CityLoading() {
  return (
    <div className="city-canvas">
      <div className="city-loading">
        <div className="skeleton-towers" aria-label="Loading the 3D view">
          {[60, 90, 75, 110, 95, 130, 70, 85, 100].map((h, i) => (
            <i key={i} style={{ height: h, animationDelay: `${i * 80}ms` }} />
          ))}
        </div>
      </div>
    </div>
  );
}
