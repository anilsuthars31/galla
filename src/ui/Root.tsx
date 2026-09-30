/* Who is using the app decides what they see: the welcome/login page, the setup steps, or the app. */
import { useCallback, useEffect, useState } from 'react';
import { api, ApiError, hasToken } from '../api/client';
import { store } from './storage';
import { savedStatement } from './savedStatement';
import { useTheme } from './theme';
import { App } from './App';
import { AuthPage } from './auth/AuthPage';
import { Onboarding } from './setup/Onboarding';
import type { Profile } from './pages/BusinessPage';
import type { Account } from '../api/client';
import type { BusinessProfile, PayeeRule } from '../engine/profile';
import type { BudgetLimits, Overrides } from '../engine/types';

const GUEST_KEY = 'galla-guest';

/** A fresh login, sign-up or guest visit starts on Overview, not wherever the last user left off. */
const startOnOverview = () => {
  if (window.location.hash) history.replaceState(null, '', window.location.pathname + window.location.search);
};

type State =
  | { kind: 'loading' }
  | { kind: 'signedOut'; notice?: string }
  | { kind: 'guest' }
  | { kind: 'setup'; account: Account; business: BusinessProfile | null; payees: PayeeRule[]; corrections: Overrides; limits: BudgetLimits }
  | { kind: 'ready'; profile: Profile };

export function Root() {
  const theme = useTheme();
  const [state, setState] = useState<State>({ kind: 'loading' });

  const load = useCallback(async () => {
    if (!hasToken()) {
      setState(store.get<boolean>(GUEST_KEY) ? { kind: 'guest' } : { kind: 'signedOut' });
      return;
    }
    setState({ kind: 'loading' });
    try {
      const [account, business, payees, corrections, limits] = await Promise.all([
        api.me(),
        api.business(),
        api.payees(),
        api.corrections(),
        api.budgetLimits(),
      ]);
      store.set(GUEST_KEY, false);
      setState(
        business?.setupComplete
          ? { kind: 'ready', profile: { account, business, payees, corrections, limits } }
          : { kind: 'setup', account, business, payees, corrections, limits },
      );
    } catch (e) {
      const offline = e instanceof ApiError && e.status === 0;
      setState({
        kind: 'signedOut',
        notice: offline ? 'Can’t reach Galla right now. You can log in again once you are online, or try the sample.' : 'Please log in again.',
      });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const logOut = async () => {
    // The statement is remembered per account on this device; logging out removes it (shared computers).
    if (state.kind === 'ready' || state.kind === 'setup') {
      savedStatement.clear(state.kind === 'ready' ? state.profile.account.id : state.account.id);
    }
    await api.logOut().catch(() => undefined);
    store.set(GUEST_KEY, false);
    setState({ kind: 'signedOut' });
  };

  const themeProps = { themePref: theme.pref, onTheme: theme.cycle };

  switch (state.kind) {
    case 'loading':
      return (
        <div className="boot" role="status" aria-label="Loading">
          <div className="spinner" />
        </div>
      );
    case 'signedOut':
      return (
        <AuthPage
          {...themeProps}
          notice={state.notice}
          onAuthed={() => {
            startOnOverview();
            void load();
          }}
          onGuest={() => {
            startOnOverview();
            store.set(GUEST_KEY, true);
            setState({ kind: 'guest' });
          }}
        />
      );
    case 'setup':
      return (
        <Onboarding
          {...themeProps}
          account={state.account}
          business={state.business}
          payees={state.payees}
          onLogOut={() => void logOut()}
          onDone={(business, payees) =>
            setState({ kind: 'ready', profile: { account: state.account, business, payees, corrections: state.corrections, limits: state.limits } })
          }
        />
      );
    case 'guest':
      return (
        <App
          {...themeProps}
          profile={null}
          onProfile={() => undefined}
          onLogOut={() => void logOut()}
          onSignIn={() => {
            store.set(GUEST_KEY, false);
            setState({ kind: 'signedOut' });
          }}
        />
      );
    case 'ready':
      return (
        <App
          {...themeProps}
          profile={state.profile}
          onProfile={(profile) => setState({ kind: 'ready', profile })}
          onLogOut={() => void logOut()}
          onSignIn={() => undefined}
        />
      );
  }
}
