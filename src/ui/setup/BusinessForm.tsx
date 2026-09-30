import { BUSINESS_TYPES, BUSINESS_TYPE_IDS, LIMITS, type BusinessProfile, type BusinessType } from '../../engine/profile';

export interface BusinessDraft {
  name: string;
  type: BusinessType | '';
  city: string;
  employees: string;
}

export const toBusinessDraft = (b: BusinessProfile | null): BusinessDraft => ({
  name: b?.name ?? '',
  type: b?.type ?? '',
  city: b?.city ?? '',
  employees: b ? String(b.employeeCount) : '',
});

/** Form values -> profile, or the first problem to show. */
export function readBusinessDraft(d: BusinessDraft, setupComplete: boolean): { profile: BusinessProfile } | { error: string } {
  const name = d.name.trim();
  if (!name) return { error: 'Add your business name.' };
  if (!d.type) return { error: 'Pick the kind of business you run.' };
  const e = d.employees.trim() === '' ? 0 : Number(d.employees);
  if (!Number.isInteger(e) || e < 0 || e > LIMITS.employeesMax) return { error: `Number of employees should be a whole number from 0 to ${LIMITS.employeesMax}.` };
  return { profile: { name, type: d.type, city: d.city.trim() || null, employeeCount: e, setupComplete } };
}

export function BusinessForm({ draft, onChange }: { draft: BusinessDraft; onChange: (d: BusinessDraft) => void }) {
  const set = (p: Partial<BusinessDraft>) => onChange({ ...draft, ...p });
  return (
    <div className="form">
      <label className="ff">
        <span>Business name</span>
        <input className="field" value={draft.name} maxLength={LIMITS.nameMax} autoComplete="organization" placeholder="e.g. Sharma Kirana Store" onChange={(e) => set({ name: e.target.value })} />
      </label>

      <fieldset className="ff">
        <legend>What kind of business?</legend>
        <div className="choice-grid">
          {BUSINESS_TYPE_IDS.map((t) => (
            <label key={t} className={`choice${draft.type === t ? ' on' : ''}`}>
              <input type="radio" name="btype" value={t} checked={draft.type === t} onChange={() => set({ type: t })} />
              {BUSINESS_TYPES[t]}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="form-row">
        <label className="ff">
          <span>
            City <em>optional</em>
          </span>
          <input className="field" value={draft.city} maxLength={LIMITS.cityMax} autoComplete="address-level2" placeholder="e.g. Pune" onChange={(e) => set({ city: e.target.value })} />
        </label>
        <label className="ff">
          <span>Employees on salary</span>
          <input
            className="field"
            inputMode="numeric"
            value={draft.employees}
            placeholder="0"
            onChange={(e) => set({ employees: e.target.value.replace(/\D/g, '').slice(0, 3) })}
          />
        </label>
      </div>
    </div>
  );
}
