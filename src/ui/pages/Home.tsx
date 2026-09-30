/* What a signed-in owner sees before any statement is loaded: who Galla is, how it works, and the upload. */
import type { ReactNode } from 'react';
import { catColor } from '../theme';
import { CATEGORIES } from '../../engine';
import { PAYEE_ROLES, PAYEE_ROLE_IDS, type PayeeRole } from '../../engine/profile';
import type { Page } from '../route';
import type { Profile } from './BusinessPage';
import { UploadCard } from './Statement';
import { Icon } from '../components/Icons';

interface Props {
  profile: Profile;
  error: string | null;
  onCloseError: () => void;
  onFile: (f: File) => void;
  onNavigate: (p: Page) => void;
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name;

const ROLE_PLURAL: Record<PayeeRole, [string, string]> = {
  employee: ['employee', 'employees'],
  landlord: ['landlord', 'landlords'],
  supplier: ['supplier', 'suppliers'],
  lender: ['loan', 'loans'],
  utility: ['bill', 'bills'],
};

export function Home({ profile, error, onCloseError, onFile, onNavigate }: Props) {
  const counts = PAYEE_ROLE_IDS.map((r) => [r, profile.payees.filter((p) => p.role === r).length] as const).filter(([, n]) => n > 0);

  return (
    <div className="page home">
      <section className="home-hero">
        <span className="eyebrow">{profile.business.name}</span>
        <h1>Welcome to Galla, {firstName(profile.account.name)}</h1>
        <p>
          Galla reads your bank statement and turns it into a cash plan: where your money goes, which payments are fixed every month,
          and whether next month looks comfortable or tight. It works with the Excel or CSV statement you already get from
          net banking.
        </p>
      </section>

      <UploadCard title="Upload your bank statement to begin" error={error} onCloseError={onCloseError} onFile={onFile} />

      <section className="steps" aria-label="How it works">
        <Step n={1} icon={<Icon.download />} title="Download your statement">
          From net banking or your bank app. The last 6 months works best; 3 months is enough to start.
        </Step>
        <Step n={2} icon={<Icon.upload />} title="Upload it here">
          Galla reads it on this device. Salary, rent, suppliers, EMIs and bills are sorted for you.
        </Step>
        <Step n={3} icon={<Icon.trend />} title="See your plan">
          Next month’s forecast, a budget built from your history that you can change, and plain warnings before a tight month.
        </Step>
      </section>

      <div className="grid-two">
        <section className="panel">
          <h2>What Galla knows about your shop</h2>
          {counts.length ? (
            <>
              <p className="muted home-p">From your setup. These help Galla recognise payments from the first upload.</p>
              <ul className="known">
                {counts.map(([r, n]) => (
                  <li key={r}>
                    <span className="sw" style={{ background: catColor(PAYEE_ROLES[r].category) }} />
                    <b className="tnum">{n}</b> {ROLE_PLURAL[r][n === 1 ? 0 : 1]}
                    <span className="muted">· sorted as {CATEGORIES[PAYEE_ROLES[r].category].name}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="muted home-p">
              Nothing yet. Adding the people you pay every month (staff, landlord, suppliers, loans) helps Galla sort your statement
              correctly from the start.
            </p>
          )}
          <button className="link" onClick={() => onNavigate('business')}>
            {counts.length ? 'Review or add more' : 'Add them now'} <Icon.arrowRight />
          </button>
        </section>

        <section className="panel">
          <h2>How to get your statement</h2>
          <ol className="howto">
            <li>Log in to net banking or your bank’s app.</li>
            <li>
              Open your current account and choose <b>Statement</b> or <b>Account statement</b>.
            </li>
            <li>Pick the last 6 months as the date range.</li>
            <li>
              Download it as <b>Excel (XLS/XLSX)</b> or <b>CSV</b>. PDF statements can’t be read yet.
            </li>
          </ol>
        </section>
      </div>

      <p className="home-privacy">
        <Icon.shield /> Your statement never leaves this device. Galla’s server only stores your account and business details.
      </p>
    </div>
  );
}

function Step({ n, icon, title, children }: { n: number; icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="step">
      <span className="step-ic">{icon}</span>
      <span className="eyebrow">Step {n}</span>
      <b>{title}</b>
      <p>{children}</p>
    </div>
  );
}

/** Shown on data pages (Budget, Cash flow, ...) until a statement is loaded. */
export function NoStatement({ what, onUpload }: { what: string; onUpload: () => void }) {
  return (
    <section className="panel empty-state">
      <span className="dz-icon">
        <Icon.file />
      </span>
      <h2>No statement yet</h2>
      <p className="muted">Upload your bank statement to see {what}.</p>
      <button className="btn primary" onClick={onUpload}>
        Upload statement
      </button>
    </section>
  );
}
