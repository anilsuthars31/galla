import { formatDate, type Analysis } from '../../engine';
import type { Source } from '../App';
import { Icon } from './Icons';

export function SourceBar({ source, analysis, count }: { source: Source; analysis: Analysis; count: number }) {
  return (
    <div className="source section-enter">
      {source.kind === 'sample' ? (
        <>
          <span className="pill sample">
            <span className="dot" />
            Sample data
          </span>
          <span>
            A fictional kirana store in Pune. <b>Upload your own statement</b> or drop it anywhere on this page.
          </span>
        </>
      ) : (
        <>
          <span className="pill good">
            <span className="dot" />
            Your file
          </span>
          <b>{source.name}</b>
        </>
      )}
      <span className="spacer" />
      <span className="num">
        {formatDate(analysis.period.from)} – {formatDate(analysis.period.to)} · {count.toLocaleString('en-IN')} transactions
      </span>
    </div>
  );
}

export function ErrorBanner({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div className="banner" role="alert">
      <Icon.warning />
      <div>
        <b>That file couldn’t be used</b>
        <p>{message}</p>
      </div>
      <button onClick={onClose} aria-label="Dismiss">
        <Icon.x />
      </button>
    </div>
  );
}
