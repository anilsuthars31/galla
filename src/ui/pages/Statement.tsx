import { useRef, type ReactNode } from 'react';
import { formatDate, type Analysis } from '../../engine';
import type { Source } from '../App';
import { Icon } from '../components/Icons';

const ACCEPT =
  '.csv,.xls,.xlsx,.xlsm,.txt,.pdf,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

/** Drop zone + file picker + the "couldn't use that file" message. Used on Home and Statement. */
export function UploadCard({
  title = 'Drop your bank statement here',
  error,
  onCloseError,
  onFile,
}: {
  title?: string;
  error: string | null;
  onCloseError: () => void;
  onFile: (f: File) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <>
      <section className="dropzone">
        <span className="dz-icon">
          <Icon.upload />
        </span>
        <h2>{title}</h2>
        <p>Excel (XLS, XLSX) or CSV downloaded from net banking. You can also drop the file anywhere on this page.</p>
        <button className="btn primary" onClick={() => input.current?.click()}>
          Choose a file
        </button>
        <span className="dz-note">
          <Icon.lock /> Read on this device. Your statement is never uploaded to our server.
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
    </>
  );
}

interface Props {
  /** Null when no statement is loaded yet. */
  current: { source: Source; analysis: Analysis; count: number } | null;
  error: string | null;
  onCloseError: () => void;
  onFile: (f: File) => void;
  /** Guests only: go back to the sample statement. */
  onSample?: () => void;
  /** Account holders only: forget the remembered statement on this device. */
  onForget?: () => void;
}

export function Statement({ current, error, onCloseError, onFile, onSample, onForget }: Props) {
  return (
    <div className="page">
      <UploadCard title={current ? 'Upload a newer statement' : undefined} error={error} onCloseError={onCloseError} onFile={onFile} />

      {current && (
        <section className="panel current">
          <span className={`src-dot${current.source.kind === 'sample' ? ' sample' : ''}`} />
          <div className="grow">
            <span className="eyebrow">{current.source.kind === 'sample' ? 'Showing sample data' : 'Showing your statement'}</span>
            <b>{current.source.name}</b>
            <span className="muted">
              {formatDate(current.analysis.period.from)} – {formatDate(current.analysis.period.to)} · {current.count.toLocaleString('en-IN')} transactions
              {onForget && ' · remembered on this device'}
            </span>
          </div>
          {onSample && current.source.kind === 'file' && (
            <button className="btn sm" onClick={onSample}>
              <Icon.sample />
              Load sample instead
            </button>
          )}
          {onForget && (
            <button className="btn sm" onClick={onForget}>
              <Icon.x />
              Remove from this device
            </button>
          )}
        </section>
      )}

      <div className="grid-three">
        <InfoCard icon={<Icon.shield />} title="Your data stays here">
          The statement is read on this device and never sent to Galla’s server. Your account only holds your business details and the
          people you pay. Logging out removes the statement from this device.
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
