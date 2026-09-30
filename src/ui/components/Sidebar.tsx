import type { ReactNode } from 'react';
import type { Source } from '../App';
import type { Profile } from '../pages/BusinessPage';
import { initials } from '../model';
import type { Page } from '../route';
import type { ThemePref } from '../theme';
import { Icon } from './Icons';

interface NavItem {
  page: Page;
  label: string;
  short: string;
  icon: () => ReactNode;
}

const NAV: NavItem[] = [
  { page: 'overview', label: 'Overview', short: 'Home', icon: Icon.home },
  { page: 'cashflow', label: 'Cash flow', short: 'Cash flow', icon: Icon.trend },
  { page: 'budget', label: 'Budget', short: 'Budget', icon: Icon.wallet },
  { page: 'recurring', label: 'Recurring', short: 'Recurring', icon: Icon.repeat },
  { page: 'transactions', label: 'Transactions', short: 'Ledger', icon: Icon.list },
  { page: 'statement', label: 'Statement', short: 'Statement', icon: Icon.file },
];

const THEME_LABEL: Record<ThemePref, string> = {
  system: 'Theme: follows your device. Switch theme',
  light: 'Theme: light. Switch to dark',
  dark: 'Theme: dark. Switch to light',
};

interface Props {
  page: Page;
  onNavigate: (p: Page) => void;
  source: Source;
  review: number;
  themePref: ThemePref;
  onTheme: () => void;
  profile: Profile | null;
  onSignIn: () => void;
}

export function Logo() {
  return (
    <span className="logo" aria-hidden="true">
      <svg viewBox="0 0 24 24">
        <rect x="4" y="12" width="4" height="8" rx="1.3" opacity="0.55" />
        <rect x="10" y="8" width="4" height="12" rx="1.3" opacity="0.8" />
        <rect x="16" y="4" width="4" height="16" rx="1.3" />
      </svg>
    </span>
  );
}

export function ThemeButton({ pref, onTheme }: { pref: ThemePref; onTheme: () => void }) {
  const ThemeIcon = pref === 'system' ? Icon.auto : pref === 'light' ? Icon.sun : Icon.moon;
  return (
    <button className="icon-btn" onClick={onTheme} aria-label={THEME_LABEL[pref]} title={THEME_LABEL[pref]}>
      <ThemeIcon />
    </button>
  );
}

export function Sidebar({ page, onNavigate, source, review, themePref, onTheme, profile, onSignIn }: Props) {
  return (
    <aside className="sidebar">
      <div className="side-brand">
        <Logo />
        <b>Galla</b>
      </div>

      <nav className="nav" aria-label="Sections">
        {NAV.map(({ page: p, label, short, icon: I }) => (
          <a
            key={p}
            href={`#/${p}`}
            className="nav-item"
            aria-current={p === page ? 'page' : undefined}
            onClick={(e) => {
              e.preventDefault();
              onNavigate(p);
            }}
          >
            <I />
            <span className="nl">{label}</span>
            <span className="ns">{short}</span>
            {p === 'transactions' && review > 0 && (
              <span className="badge" aria-label={`${review} need review`}>
                {review > 99 ? '99+' : review}
              </span>
            )}
          </a>
        ))}
      </nav>

      <div className="side-foot">
        <div className="src-card">
          <span className={`src-dot${source.kind === 'sample' ? ' sample' : ''}`} />
          <div>
            <span className="eyebrow">{source.kind === 'sample' ? 'Sample data' : 'Your statement'}</span>
            <b title={source.name}>{source.name}</b>
          </div>
        </div>
        <div className="side-actions">
          <button className="btn sm grow" onClick={() => onNavigate('statement')}>
            <Icon.upload />
            {source.kind === 'sample' ? 'Use my statement' : 'Replace file'}
          </button>
          <ThemeButton pref={themePref} onTheme={onTheme} />
        </div>
        {profile ? (
          <a
            href="#/business"
            className="acct"
            aria-current={page === 'business' ? 'page' : undefined}
            onClick={(e) => {
              e.preventDefault();
              onNavigate('business');
            }}
          >
            <span className="acct-av" aria-hidden="true">
              {initials(profile.business.name)}
            </span>
            <span className="acct-txt">
              <b>{profile.business.name}</b>
              <span>{profile.account.email}</span>
            </span>
          </a>
        ) : (
          <button className="acct guest" onClick={onSignIn}>
            <span className="acct-av" aria-hidden="true">
              <Icon.lock />
            </span>
            <span className="acct-txt">
              <b>Guest</b>
              <span>Create an account or log in</span>
            </span>
          </button>
        )}
      </div>
    </aside>
  );
}

/** Top-bar account shortcut on small screens (the sidebar footer is hidden there). */
export function AccountButton({ profile, onOpen, onSignIn }: { profile: Profile | null; onOpen: () => void; onSignIn: () => void }) {
  return profile ? (
    <button className="acct-av btn-av" onClick={onOpen} aria-label={`Your business: ${profile.business.name}`} title={profile.business.name}>
      {initials(profile.business.name)}
    </button>
  ) : (
    <button className="btn sm" onClick={onSignIn}>
      Log in
    </button>
  );
}
