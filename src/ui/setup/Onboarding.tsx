import { useState } from 'react';
import type { BusinessProfile, PayeeRule } from '../../engine/profile';
import { api, ApiError, type Account } from '../../api/client';
import { newDraft, toDraft, type PayeeDraft } from '../../api/payeeDraft';
import { savePayees } from '../../api/savePayees';
import { BusinessForm, readBusinessDraft, toBusinessDraft } from './BusinessForm';
import { PEOPLE, PayeeEditor, SUPPLIES, rolesOf, type PayeeSectionSpec } from './PayeeEditor';
import { Logo, ThemeButton } from '../components/Sidebar';
import type { ThemePref } from '../theme';

interface Props {
  account: Account;
  business: BusinessProfile | null;
  payees: PayeeRule[];
  onDone: (business: BusinessProfile, payees: PayeeRule[]) => void;
  onLogOut: () => void;
  themePref: ThemePref;
  onTheme: () => void;
}

const STEPS = [
  { title: 'Your business', sub: 'A few basics so Galla fits the way you work.' },
  { title: 'People you pay every month', sub: 'Galla uses these to spot salary and rent in your statement straight away.' },
  { title: 'Suppliers, loans and bills', sub: 'So stock purchases, EMIs and bills are sorted correctly from the first upload.' },
];

/** Saved rows for these sections, or starter rows when there are none yet. */
function initialDrafts(payees: PayeeRule[], specs: PayeeSectionSpec[], employees: number): PayeeDraft[] {
  const out: PayeeDraft[] = [];
  for (const s of specs) {
    const saved = payees.filter((p) => p.role === s.role).map(toDraft);
    if (saved.length) out.push(...saved);
    else {
      const n = s.role === 'employee' ? Math.min(Math.max(employees, 1), 10) : 1;
      for (let i = 0; i < n; i++) out.push(newDraft(s.role));
    }
  }
  return out;
}

export function Onboarding({ account, business, payees: saved, onDone, onLogOut, themePref, onTheme }: Props) {
  const [step, setStep] = useState(0);
  const [biz, setBiz] = useState(() => toBusinessDraft(business));
  const [profile, setProfile] = useState(business);
  const [payees, setPayees] = useState(saved);
  const [drafts, setDrafts] = useState<PayeeDraft[]>([]);
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const specs = step === 1 ? PEOPLE : SUPPLIES;

  const goTo = (next: number, prof = profile, list = payees) => {
    setError(null);
    setRowErrors({});
    if (next === 1) setDrafts(initialDrafts(list, PEOPLE, prof?.employeeCount ?? 1));
    if (next === 2) setDrafts(initialDrafts(list, SUPPLIES, 0));
    setStep(next);
    window.scrollTo({ top: 0 });
  };

  const run = async (fn: () => Promise<void>) => {
    setSaving(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : 'Something went wrong. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const finish = (list: PayeeRule[]) =>
    run(async () => {
      const done = await api.saveBusiness({ ...profile!, setupComplete: true });
      onDone(done, list);
    });

  const next = () => {
    if (step === 0) {
      const r = readBusinessDraft(biz, false);
      if ('error' in r) return setError(r.error);
      return run(async () => {
        const p = await api.saveBusiness(r.profile);
        setProfile(p);
        goTo(1, p);
      });
    }
    return run(async () => {
      const r = await savePayees(payees, drafts, rolesOf(specs));
      if (!r.ok) {
        setRowErrors(r.errors);
        setError('Some rows need a fix before saving.');
        return;
      }
      setPayees(r.payees);
      if (step === 1) goTo(2, profile, r.payees);
      else await finish(r.payees);
    });
  };

  const skip = () => (step === 1 ? goTo(2) : finish(payees));

  return (
    <div className="setup">
      <header className="setup-top">
        <Logo />
        <b>Galla</b>
        <span className="grow" />
        <span className="muted setup-who">{account.email}</span>
        <button className="btn ghost sm" onClick={onLogOut}>
          Log out
        </button>
        <ThemeButton pref={themePref} onTheme={onTheme} />
      </header>

      <main className="setup-main" id="main">
        <ol className="stepper" aria-label="Setup steps">
          {STEPS.map((s, i) => (
            <li key={s.title} className={i === step ? 'on' : i < step ? 'done' : ''} aria-current={i === step ? 'step' : undefined}>
              <span className="dot">{i < step ? '✓' : i + 1}</span>
              <span className="lbl">{s.title}</span>
            </li>
          ))}
        </ol>

        <form
          className="panel setup-card"
          onSubmit={(e) => {
            e.preventDefault();
            void next();
          }}
          noValidate
        >
          <div className="setup-head">
            <span className="eyebrow">
              Step {step + 1} of {STEPS.length}
            </span>
            <h1>{STEPS[step]!.title}</h1>
            <p>{STEPS[step]!.sub}</p>
          </div>

          {step === 0 ? (
            <BusinessForm draft={biz} onChange={setBiz} />
          ) : (
            <div className="pe-list">
              {specs.map((s) => (
                <PayeeEditor key={s.role} spec={s} drafts={drafts} onChange={setDrafts} errors={rowErrors} />
              ))}
              <p className="privacy-note">
                These names and amounts are saved to your Galla account. Your bank statement itself is never uploaded.
              </p>
            </div>
          )}

          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}

          <div className="setup-actions">
            {step > 0 && (
              <button type="button" className="btn ghost" onClick={() => goTo(step - 1)} disabled={saving}>
                Back
              </button>
            )}
            <span className="grow" />
            {step > 0 && (
              <button type="button" className="btn ghost" onClick={() => void skip()} disabled={saving}>
                {step === STEPS.length - 1 ? 'Skip and finish' : 'Skip for now'}
              </button>
            )}
            <button type="submit" className="btn primary" disabled={saving}>
              {saving ? 'Saving…' : step === STEPS.length - 1 ? 'Finish setup' : 'Continue'}
            </button>
          </div>
        </form>
      </main>
    </div>
  );
}
