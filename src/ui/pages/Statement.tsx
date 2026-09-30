import { useRef, type ReactNode } from 'react';
import { formatDate, type Analysis } from '../../engine';
import type { Source } from '../App';
import { Icon } from '../components/Icons';

const ACCEPT =
  '.csv,.xls,.xlsx,.xlsm,.txt,.pdf,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

interface Props {
  source: Source;
  analysis: Analysis;
  count: number;
  error: string | null;
  onCloseError: () => void;
  onFile: (f: File) => void;
  onSample: () => void;
}

export function Statement({ source, analysis, count, error, onCloseError, onFile, onSample }: Props) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="page">
      <section className="dropzone">
        <span className="dz-icon">
          <Icon.upload />
        </span>
        <h2>Drop your bank statement here</h2>
        <p>CSV, XLS or XLSX downloaded from net banking. You can also drop a file anywhere in the app.</p>
        <button className="btn primary" onClick={() => input.current?.click()}>
          Choose a file
        </button>
        <span className="dz-note">
          <Icon.lock /> Read in this browser. Never uploaded.
        </span>
        <input
          ref={input}
          type="file"
          accept={ACCEPT}
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
            e.target.value = '';
          }}
        />
      </section>

      {error && (
        <div className="banner" role="alert">
          <Icon.warning />
          <div>
            <b>That file couldn’t be used</b>
            <p>{error}</p>
          </div>
          <button onClick={onCloseError} aria-label="Dismiss">
            <Icon.x />
          </button>
        </div>
      )}

      <section className="panel current">
        <span className={`src-dot${source.kind === 'sample' ? ' sample' : ''}`} />
        <div className="grow">
          <span className="eyebrow">{source.kind === 'sample' ? 'Showing sample data' : 'Showing your statement'}</span>
          <b>{source.name}</b>
          <span className="muted">
            {formatDate(analysis.period.from)} – {formatDate(analysis.period.to)} · {count.toLocaleString('en-IN')} transactions
          </span>
        </div>
        {source.kind === 'file' && (
          <button className="btn sm" onClick={onSample}>
            <Icon.sample />
            Load sample instead
          </button>
        )}
      </section>

      <div className="grid-three">
        <InfoCard icon={<Icon.shield />} title="Your data stays here">
          The statement is read in this browser and is never uploaded. There is no account and no tracking. Only your category choices
          are remembered, on this device.
        </InfoCard>
        <InfoCard icon={<Icon.file />} title="Supported files">
          CSV or Excel exports from net banking with date, narration, withdrawal and deposit columns (or one amount column with Dr/Cr),
          and optionally the balance. PDF statements are not read yet: download the Excel version instead.
        </InfoCard>
        <InfoCard icon={<Icon.trend />} title="How it works">
          Each narration is decoded for its payment mode and payee, then sorted into a category by rules and a trained model. Repeating
          payments become recurring items, and the forecast takes income at the lower of the recent and long-run average.
        </InfoCard>
      </div>
    </div>
  );
}

function InfoCard({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="panel info">
      <span className="info-ic">{icon}</span>
      <b>{title}</b>
      <p>{children}</p>
    </div>
  );
}
