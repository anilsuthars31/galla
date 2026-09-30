import { LIMITS, type PayeeRole } from '../../engine/profile';
import { newDraft, type PayeeDraft } from '../../api/payeeDraft';
import { Icon } from '../components/Icons';

export interface PayeeSectionSpec {
  role: PayeeRole;
  title: string;
  hint: string;
  namePlaceholder: string;
  /** Label for the amount column, or null to hide it. */
  amountLabel: string | null;
  showDay: boolean;
  addLabel: string;
}

interface Props {
  spec: PayeeSectionSpec;
  drafts: PayeeDraft[];
  onChange: (all: PayeeDraft[]) => void;
  errors: Record<string, string>;
}

/** Rows for one role. `drafts` holds every role's rows; this edits only its own. */
export function PayeeEditor({ spec, drafts, onChange, errors }: Props) {
  const rows = drafts.filter((d) => d.role === spec.role);
  const update = (key: string, p: Partial<PayeeDraft>) => onChange(drafts.map((d) => (d.key === key ? { ...d, ...p } : d)));
  const remove = (key: string) => onChange(drafts.filter((d) => d.key !== key));
  const cols = `pe-cols${spec.amountLabel ? '' : ' no-amt'}${spec.showDay ? '' : ' no-day'}`;

  return (
    <section className="pe">
      <div className="pe-head">
        <b>{spec.title}</b>
        <span>{spec.hint}</span>
      </div>
      {rows.length > 0 && (
        <div className={`pe-labels ${cols}`} aria-hidden="true">
          <span>Name as it appears</span>
          {spec.amountLabel && <span>{spec.amountLabel}</span>}
          {spec.showDay && <span>Day paid</span>}
          <span>
            UPI ID <em>optional</em>
          </span>
          <span />
        </div>
      )}
      {rows.map((d, i) => (
        <div key={d.key} className="pe-item">
          <div className={`pe-row ${cols}`}>
            <input
              className="field"
              aria-label={`${spec.title}: name ${i + 1}`}
              placeholder={spec.namePlaceholder}
              maxLength={LIMITS.nameMax}
              value={d.name}
              onChange={(e) => update(d.key, { name: e.target.value })}
            />
            {spec.amountLabel && (
              <label className="pe-money">
                <span aria-hidden="true">₹</span>
                <input
                  className="field"
                  inputMode="numeric"
                  aria-label={`${spec.amountLabel} ${i + 1}`}
                  placeholder="Amount"
                  value={d.amount}
                  onChange={(e) => update(d.key, { amount: e.target.value.replace(/[^\d,.]/g, '') })}
                />
              </label>
            )}
            {spec.showDay && (
              <input
                className="field"
                inputMode="numeric"
                aria-label={`Day of month ${i + 1}`}
                placeholder="1–31"
                value={d.day}
                onChange={(e) => update(d.key, { day: e.target.value.replace(/\D/g, '').slice(0, 2) })}
              />
            )}
            <input
              className="field"
              aria-label={`UPI ID ${i + 1} (optional)`}
              placeholder="name@okaxis"
              maxLength={LIMITS.nameMax}
              value={d.alias}
              onChange={(e) => update(d.key, { alias: e.target.value })}
            />
            <button type="button" className="icon-btn ghost" aria-label={`Remove row ${i + 1}`} onClick={() => remove(d.key)}>
              <Icon.x />
            </button>
          </div>
          {errors[d.key] && (
            <p className="pe-err" role="alert">
              {errors[d.key]}
            </p>
          )}
        </div>
      ))}
      <button type="button" className="btn ghost sm pe-add" onClick={() => onChange([...drafts, newDraft(spec.role)])}>
        <Icon.plus />
        {spec.addLabel}
      </button>
    </section>
  );
}

export const PEOPLE: PayeeSectionSpec[] = [
  {
    role: 'employee',
    title: 'Employees',
    hint: 'Salaries you pay by bank transfer or UPI. Cash salaries don’t show up in the statement, so skip those.',
    namePlaceholder: 'e.g. Suresh Pawar',
    amountLabel: 'Monthly salary',
    showDay: true,
    addLabel: 'Add employee',
  },
  {
    role: 'landlord',
    title: 'Shop rent',
    hint: 'Who you pay rent to. Leave empty if you own the shop.',
    namePlaceholder: 'e.g. Ramesh Gupta',
    amountLabel: 'Monthly rent',
    showDay: true,
    addLabel: 'Add landlord',
  },
];

export const SUPPLIES: PayeeSectionSpec[] = [
  {
    role: 'supplier',
    title: 'Suppliers',
    hint: 'Distributors and wholesalers you buy stock from. Amounts vary, so only the name is needed.',
    namePlaceholder: 'e.g. Shree Ganesh Distributors',
    amountLabel: null,
    showDay: false,
    addLabel: 'Add supplier',
  },
  {
    role: 'lender',
    title: 'Loans and EMIs',
    hint: 'Business or personal loans paid from this account.',
    namePlaceholder: 'e.g. Bajaj Finance',
    amountLabel: 'EMI',
    showDay: true,
    addLabel: 'Add loan',
  },
  {
    role: 'utility',
    title: 'Bills',
    hint: 'Electricity, internet, phone.',
    namePlaceholder: 'e.g. MSEDCL Electricity',
    amountLabel: 'Usual bill',
    showDay: true,
    addLabel: 'Add bill',
  },
];

export const rolesOf = (specs: PayeeSectionSpec[]) => specs.map((s) => s.role);
