import { useState } from 'react';
import type { BusinessProfile, PayeeRule } from '../../engine/profile';
import type { BudgetLimits, Overrides } from '../../engine/types';
import { api, ApiError, type Account } from '../../api/client';
import { toDraft, type PayeeDraft } from '../../api/payeeDraft';
import { savePayees } from '../../api/savePayees';
import { BusinessForm, readBusinessDraft, toBusinessDraft } from '../setup/BusinessForm';
import { PEOPLE, PayeeEditor, SUPPLIES, rolesOf, type PayeeSectionSpec } from '../setup/PayeeEditor';
import { CardHead } from '../components/PageHeader';

export interface Profile {
  account: Account;
  business: BusinessProfile;
  payees: PayeeRule[];
  /** Category corrections saved to the account, as loaded at sign-in (the app keeps the live copy). */
  corrections: Overrides;
  /** The owner's own budget amounts, as loaded at sign-in. */
  limits: BudgetLimits;
}

interface Props {
  profile: Profile;
  onChange: (p: Profile) => void;
  onLogOut: () => void;
  notify: (message: string) => void;
}

export function BusinessPage({ profile, onChange, onLogOut, notify }: Props) {
  return (
    <div className="page">
      <DetailsCard profile={profile} onChange={onChange} notify={notify} />
      <PayeesCard
        title="People you pay every month"
        sub="Salaries and rent. Galla matches these names in your statement."
        specs={PEOPLE}
        profile={profile}
        onChange={onChange}
        notify={notify}
      />
      <PayeesCard
        title="Suppliers, loans and bills"
        sub="Stock suppliers, EMIs and regular bills."
        specs={SUPPLIES}
        profile={profile}
        onChange={onChange}
        notify={notify}
      />
      <section className="panel account-card">
        <div>
          <span className="eyebrow">Signed in as</span>
          <b>{profile.account.name}</b>
          <span className="muted">{profile.account.email}</span>
        </div>
        <button className="btn" onClick={onLogOut}>
          Log out
        </button>
      </section>
    </div>
  );
}

type CardProps = Omit<Props, 'onLogOut'>;

const message = (e: unknown) => (e instanceof ApiError ? e.message : 'Something went wrong. Please try again.');

function DetailsCard({ profile, onChange, notify }: CardProps) {
  const [draft, setDraft] = useState(() => toBusinessDraft(profile.business));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(toBusinessDraft(profile.business));

  const save = async () => {
    const r = readBusinessDraft(draft, true);
    if ('error' in r) return setError(r.error);
    setSaving(true);
    setError(null);
    try {
      const business = await api.saveBusiness(r.profile);
      onChange({ ...profile, business });
      setDraft(toBusinessDraft(business));
      notify('Business details saved.');
    } catch (e) {
      setError(message(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      className="panel"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      noValidate
    >
      <CardHead title="Business details" />
      <BusinessForm draft={draft} onChange={setDraft} />
      <SaveBar dirty={dirty} saving={saving} error={error} onReset={() => setDraft(toBusinessDraft(profile.business))} />
    </form>
  );
}

function PayeesCard({ title, sub, specs, profile, onChange, notify }: CardProps & { title: string; sub: string; specs: PayeeSectionSpec[] }) {
  const roles = rolesOf(specs);
  const fromSaved = (list: PayeeRule[]) => list.filter((p) => roles.includes(p.role)).map(toDraft);
  const [drafts, setDrafts] = useState<PayeeDraft[]>(() => fromSaved(profile.payees));
  const [rowErrors, setRowErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const signature = (ds: PayeeDraft[]) => JSON.stringify(ds.filter((d) => d.name || d.amount || d.day || d.alias).map(({ key: _k, ...rest }) => rest));
  const dirty = signature(drafts) !== signature(fromSaved(profile.payees));

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const r = await savePayees(profile.payees, drafts, roles);
      if (!r.ok) {
        setRowErrors(r.errors);
        setError('Some rows need a fix before saving.');
        return;
      }
      setRowErrors({});
      onChange({ ...profile, payees: r.payees });
      setDrafts(r.payees.filter((p) => roles.includes(p.role)).map(toDraft));
      notify('Saved.');
    } catch (e) {
      setError(message(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      className="panel"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      noValidate
    >
      <CardHead title={title} sub={sub} />
      <div className="pe-list">
        {specs.map((s) => (
          <PayeeEditor key={s.role} spec={s} drafts={drafts} onChange={setDrafts} errors={rowErrors} />
        ))}
      </div>
      <SaveBar
        dirty={dirty}
        saving={saving}
        error={error}
        onReset={() => {
          setDrafts(fromSaved(profile.payees));
          setRowErrors({});
          setError(null);
        }}
      />
    </form>
  );
}

function SaveBar({ dirty, saving, error, onReset }: { dirty: boolean; saving: boolean; error: string | null; onReset: () => void }) {
  return (
    <div className="save-bar">
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : (
        <span className="muted">{dirty ? 'You have unsaved changes.' : ''}</span>
      )}
      <span className="grow" />
      {dirty && (
        <button type="button" className="btn ghost sm" onClick={onReset} disabled={saving}>
          Discard
        </button>
      )}
      <button type="submit" className="btn primary sm" disabled={!dirty || saving}>
        {saving ? 'Saving…' : 'Save changes'}
      </button>
    </div>
  );
}
