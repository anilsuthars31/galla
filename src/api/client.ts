/* Talking to the Galla API. Only the account, business profile and payees go over the network;
   the bank statement never does. The session token is kept in localStorage and sent as a Bearer header. */
import type { BusinessProfile, PayeeInput, PayeeRule } from '../engine/profile';
import type { BudgetLimits, CategoryId, ExpenseCategory, Overrides } from '../engine/types';

/** Empty when this build has no API (then only the sample/guest mode is offered). */
export const API_URL: string = (import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? 'http://localhost:8787' : '')).replace(/\/$/, '');

const TOKEN_KEY = 'galla-token';

export interface Account {
  id: string;
  name: string;
  email: string;
}

/** A failure with a sentence the owner can act on. `status` 0 means the server could not be reached. */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function setToken(token: string | null) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage blocked: the session lasts for this visit only */
  }
}

export const hasToken = () => getToken() !== null;

/* better-auth error codes -> what the owner should read */
const AUTH_MESSAGES: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: 'That email and password don’t match. Check them and try again.',
  USER_ALREADY_EXISTS: 'An account with this email already exists. Log in instead.',
  USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL: 'An account with this email already exists. Log in instead.',
  PASSWORD_TOO_SHORT: 'Use a password of at least 8 characters.',
  PASSWORD_TOO_LONG: 'That password is too long.',
  INVALID_EMAIL: 'That doesn’t look like an email address.',
};

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!API_URL) throw new ApiError('Accounts are not available in this demo. You can still try Galla with sample data.', 0);
  const headers = new Headers(init.headers);
  if (init.body) headers.set('Content-Type', 'application/json');
  const token = getToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);

  let res: Response;
  try {
    res = await fetch(API_URL + path, { ...init, headers });
  } catch {
    throw new ApiError('Can’t reach Galla right now. Check your internet connection and try again.', 0);
  }

  const fresh = res.headers.get('set-auth-token');
  if (fresh) setToken(fresh);
  if (res.status === 204) return undefined as T;

  const data = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/api/auth/')) setToken(null);
    let code = typeof data?.code === 'string' ? data.code : '';
    if (code === 'VALIDATION_ERROR' && /email/i.test(String(data?.message))) code = 'INVALID_EMAIL';
    const msg = AUTH_MESSAGES[code] ?? (typeof data?.error === 'string' ? data.error : null) ?? (typeof data?.message === 'string' ? data.message : null);
    throw new ApiError(msg ?? 'Something went wrong. Please try again.', res.status);
  }
  return data as T;
}

const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) });

export const api = {
  async signUp(name: string, email: string, password: string): Promise<void> {
    await request('/api/auth/sign-up/email', json('POST', { name, email, password }));
  },
  async logIn(email: string, password: string): Promise<void> {
    await request('/api/auth/sign-in/email', json('POST', { email, password }));
  },
  async logOut(): Promise<void> {
    try {
      // Needs a JSON body: over real HTTP the auth server rejects a body-less POST with 415.
      await request('/api/auth/sign-out', json('POST', {}));
    } finally {
      setToken(null); // logged out on this device even if the server can't be reached
    }
  },
  me: () => request<Account>('/api/me'),
  business: async () => (await request<{ business: BusinessProfile | null }>('/api/business')).business,
  saveBusiness: async (b: BusinessProfile) => (await request<{ business: BusinessProfile }>('/api/business', json('PUT', b))).business,
  payees: async () => (await request<{ payees: PayeeRule[] }>('/api/payees')).payees,
  addPayee: async (p: PayeeInput) => (await request<{ payee: PayeeRule }>('/api/payees', json('POST', p))).payee,
  updatePayee: async (id: string, p: Partial<PayeeInput>) =>
    (await request<{ payee: PayeeRule }>(`/api/payees/${encodeURIComponent(id)}`, json('PATCH', p))).payee,
  deletePayee: (id: string) => request<void>(`/api/payees/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  corrections: async () => (await request<{ corrections: Overrides }>('/api/corrections')).corrections,
  setCorrection: (key: string, category: CategoryId) => request<unknown>(`/api/corrections/${encodeURIComponent(key)}`, json('PUT', { category })),
  deleteCorrection: (key: string) => request<void>(`/api/corrections/${encodeURIComponent(key)}`, { method: 'DELETE' }),
  clearCorrections: () => request<void>('/api/corrections', { method: 'DELETE' }),
  budgetLimits: async () => (await request<{ limits: BudgetLimits }>('/api/budget')).limits,
  setBudgetLimit: (category: ExpenseCategory, amount: number) => request<unknown>(`/api/budget/${category}`, json('PUT', { amount })),
  resetBudgetLimit: (category: ExpenseCategory) => request<void>(`/api/budget/${category}`, { method: 'DELETE' }),
  importCorrections: async (corrections: Overrides) =>
    (await request<{ corrections: Overrides }>('/api/corrections/import', json('POST', { corrections }))).corrections,
};
