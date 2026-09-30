import { useState } from 'react';
import { API_URL, api, ApiError } from '../../api/client';
import { Logo, ThemeButton } from '../components/Sidebar';
import { Icon } from '../components/Icons';
import type { ThemePref } from '../theme';

interface Props {
  onAuthed: () => void;
  onGuest: () => void;
  /** Shown when a saved session could not be restored (e.g. the server was unreachable). */
  notice?: string | null;
  themePref: ThemePref;
  onTheme: () => void;
}

type Mode = 'login' | 'signup';

export function AuthPage({ onAuthed, onGuest, notice, themePref, onTheme }: Props) {
  const [mode, setMode] = useState<Mode>('signup');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const available = API_URL !== '';

  const submit = async () => {
    setError(null);
    if (mode === 'signup' && !name.trim()) return setError('Add your name.');
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setError('Enter your email address.');
    if (password.length < 8) return setError('Use a password of at least 8 characters.');
    setBusy(true);
    try {
      if (mode === 'signup') await api.signUp(name.trim(), email.trim(), password);
      else await api.logIn(email.trim(), password);
      onAuthed();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const switchTo = (m: Mode) => {
    setMode(m);
    setError(null);
  };

  return (
    <div className="auth">
      <aside className="auth-hero">
        <div className="auth-brand">
          <Logo />
          <b>Galla</b>
        </div>
        <div className="auth-pitch">
          <h1>Know next month’s cash before it happens.</h1>
          <p>Upload your bank statement. Galla sorts every payment, finds your fixed costs and warns you before a tight month.</p>
          <ul>
            <li>
              <Icon.good /> Salary, rent, suppliers and EMIs sorted automatically
            </li>
            <li>
              <Icon.good /> Next month’s forecast and a budget built from your own history
            </li>
            <li>
              <Icon.shield /> Your statement is read on your device and never uploaded
            </li>
          </ul>
        </div>
        <span className="auth-foot">Made for small shops in India</span>
      </aside>

      <main className="auth-main" id="main">
        <div className="auth-theme">
          <ThemeButton pref={themePref} onTheme={onTheme} />
        </div>
        <div className="auth-card">
          <div className="auth-mobile-brand">
            <Logo />
            <b>Galla</b>
          </div>
          <h2>{mode === 'signup' ? 'Create your account' : 'Welcome back'}</h2>
          <p className="muted">{mode === 'signup' ? 'Takes a minute. Then tell Galla about your shop.' : 'Log in to your shop’s cash plan.'}</p>

          {notice && (
            <p className="form-notice" role="status">
              {notice}
            </p>
          )}

          {available ? (
            <form
              className="form"
              onSubmit={(e) => {
                e.preventDefault();
                void submit();
              }}
              noValidate
            >
              {mode === 'signup' && (
                <label className="ff">
                  <span>Your name</span>
                  <input className="field" autoComplete="name" value={name} onChange={(e) => setName(e.target.value)} />
                </label>
              )}
              <label className="ff">
                <span>Email</span>
                <input className="field" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </label>
              <label className="ff">
                <span>Password</span>
                <input
                  className="field"
                  type="password"
                  autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                {mode === 'signup' && <small>At least 8 characters.</small>}
              </label>
              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}
              <button type="submit" className="btn primary block" disabled={busy}>
                {busy ? 'Please wait…' : mode === 'signup' ? 'Create account' : 'Log in'}
              </button>
              <p className="auth-switch">
                {mode === 'signup' ? (
                  <>
                    Already have an account?{' '}
                    <button type="button" className="link" onClick={() => switchTo('login')}>
                      Log in
                    </button>
                  </>
                ) : (
                  <>
                    New to Galla?{' '}
                    <button type="button" className="link" onClick={() => switchTo('signup')}>
                      Create an account
                    </button>
                  </>
                )}
              </p>
            </form>
          ) : (
            <p className="form-notice">Accounts are not available in this demo build.</p>
          )}

          <div className="or">
            <span>or</span>
          </div>
          <button type="button" className="btn block" onClick={onGuest}>
            <Icon.sample />
            Try it with sample data
          </button>
          <p className="auth-small">No account needed. Uses a fictional kirana store’s statement.</p>
        </div>
      </main>
    </div>
  );
}
