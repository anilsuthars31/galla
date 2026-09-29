import type { ThemePref } from '../theme';
import { Icon } from './Icons';

interface Props {
  themePref: ThemePref;
  onTheme: () => void;
  onUpload: () => void;
  onSample: () => void;
  isSample: boolean;
}

const THEME_LABEL: Record<ThemePref, string> = {
  system: 'Theme: follows your device. Switch theme',
  light: 'Theme: light. Switch to dark',
  dark: 'Theme: dark. Switch to light',
};

export function Header({ themePref, onTheme, onUpload, onSample, isSample }: Props) {
  const ThemeIcon = themePref === 'system' ? Icon.auto : themePref === 'light' ? Icon.sun : Icon.moon;
  return (
    <header className="topbar">
      <div className="topbar-in">
        <div className="brand">
          <div className="logo" aria-hidden="true">
            <i />
            <i />
            <i />
          </div>
          <div>
            <h1>Galla</h1>
            <p>Cash planning from your bank statement</p>
          </div>
        </div>
        <div className="actions">
          <button className="icon-btn" onClick={onTheme} aria-label={THEME_LABEL[themePref]} title={THEME_LABEL[themePref]}>
            <ThemeIcon />
          </button>
          {!isSample && (
            <button className="btn ghost sample-btn" onClick={onSample}>
              <Icon.sample />
              <span className="label">Sample</span>
            </button>
          )}
          <button className="btn brand" onClick={onUpload}>
            <Icon.upload />
            Upload<span className="long">&nbsp;statement</span>
          </button>
        </div>
      </div>
    </header>
  );
}
