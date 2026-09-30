# Galla — cash planning from bank statements

Galla turns a small Indian business's bank statement (CSV/Excel) into categorized transactions,
recurring payments, monthly budget limits, a 3-month cash forecast and plain-language alerts.
BTech final project (solo). Statements are parsed and categorised in the browser; a small API stores accounts
and business profiles only (never transactions).

The full design is in the project doc ("Galla — Project Doc"). This file is the working rules.

## Stack

- Vite + React + TypeScript (strict mode)
- Charts: hand-written SVG (no chart library, no 3D; see docs/decisions.md D11)
- Excel reading: SheetJS (`xlsx`)
- Tests: Vitest
- ML training: Python 3.11 + scikit-learn + pandas in `ml/` (training and evaluation only, never shipped)
- API (`server/`): Node + Hono + TypeScript, PostgreSQL via Drizzle (migrations in `server/drizzle/`),
  auth via better-auth with Bearer tokens (D12). PGlite locally and in tests (no Docker); Neon Postgres in production.
- No analytics or telemetry anywhere (better-auth telemetry is explicitly off).

## Commands

```bash
npm install
npm run dev        # local dev server
npm test           # vitest, must pass before any commit
npm run build      # type-check + production build

# ML (from ml/)
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
python train.py    # trains on data/synthetic + rule labels, evaluates on data/labels, writes public/model.json
jupyter notebook   # notebooks/ for exploration, confusion matrix, charts for the report

# API (from server/)
npm install
npm run dev          # http://localhost:8787, data in server/.data (PGlite)
npm test             # API tests against an in-memory Postgres, must pass before any commit
npm run db:generate  # after editing src/db/schema.ts: writes a new SQL migration (commit it)
```

## Layout

```
src/
  engine/              # PURE functions. No React, no DOM, no localStorage.
    parse.ts           # CSV/Excel rows -> RawTxn[]; header detection, dates, amounts, Dr/Cr
    narration.ts       # rail detection (UPI/NEFT/IMPS/RTGS/NACH/ATM/charges) + payee extraction
    rules.ts           # keyword rules -> category (confidence 1.0)
    classifier.ts      # V3 inference only: loads public/model.json, rebuilds TF-IDF features, returns probabilities
    categorize.ts      # order: owner override > setup payee > rule > model (>= 0.8) > "needs review"
    profileMatch.ts    # matches withdrawals to setup payees (name, UPI id, usual amount)
    candidates.ts      # regular payees to ask the owner about ("Who are these?")
    recurring.ts       # monthly + quarterly detection
    forecast.ts        # 3-month conservative forecast + closing balance
    budget.ts          # per-category limits
    alerts.ts
    types.ts
  engine/profile.ts    # business types + payee roles, shared with server/ (constants and types only)
  api/                 # API client + setup-form helpers (payee rows -> create/update/delete plan)
  ui/                  # React components; read engine output, never re-implement logic
    Root.tsx           # welcome/login -> setup -> app
ml/                    # Python training + evaluation (not part of the web build)
  features.py          # narration cleaning + feature extraction; MUST match src/engine/classifier.ts exactly
  train.py             # train, evaluate, export public/model.json
  evaluate.py          # metrics, baselines, confusion matrix -> docs/results.md
  notebooks/           # exploration and report charts
public/
  model.json           # exported model: vocabulary, idf weights, coefficients, intercepts, classes, version
prototype/             # earlier single-file prototype (reference only; port logic from engine.js)
data/
  synthetic/           # LLM-generated statements, source=synthetic
  real/                # GITIGNORED. Anonymized real statements, never committed
  labels/              # hand-labelled real rows used as the ONLY test set
server/                # API (separate package.json)
  src/app.ts           # Hono app factory: CORS, session lookup, routes, JSON errors
  src/auth.ts          # better-auth config
  src/db/              # schema.ts (Drizzle) + client.ts (pg in production, PGlite locally)
  drizzle/             # generated SQL migrations, applied on startup
  tests/               # API tests (each file gets its own in-memory database)
tests/
  fixtures/            # small anonymized narration samples per bank
```

## Data format

Canonical CSV: `date,narration,withdrawal,deposit,balance,category,source`

- Dates ISO `YYYY-MM-DD` after parsing. Amounts are positive numbers; direction comes from which column is filled.
- Categories (exact ids, do not rename):
  - income: `sales`, `other_income`
  - expense: `suppliers`, `salary`, `rent`, `utilities`, `emi`, `tax`, `personal`, `charges`, `other`
- `source` is `synthetic` or `real`.

Labelling rules (apply consistently, they matter for evaluation):
- A reversal of a sale (money going back out) is a withdrawal, category `other` (money out never gets an income
  category; decided 2026-09-29, see docs/decisions.md D7). The synthetic CSVs still say `sales` for these;
  `ml/train.py` maps them to `other` at load time. A refund received is a deposit, category `other_income`.
- A refund of a bank charge is a deposit, `other_income`.
- ATM cash withdrawals are `other`, not `personal` (kirana owners often pay suppliers in cash).
- The same payee can be a customer and a payee (e.g. `ramesh@upi` sends sales and receives rent). Category follows
  direction + amount + context, not the payee alone. Tag these rows `hard_case` in test sets.

## Rules for the engine

- Engine functions are pure and deterministic. Same input, same output. No `Date.now()` inside logic; pass "today" in.
- Parsing must not assume a bank. Detect the header row (it may not be line 1), map columns by name, and accept:
  `dd/mm/yy`, `dd/mm/yyyy`, `dd-Mon-yyyy`, ISO, and Excel serial dates; amounts with commas, `₹`, `Rs`, `Dr`/`Cr`;
  a single amount column plus a Dr/Cr column.
- Error messages are for a shop owner: say what is wrong with the file and what to do ("Download the Excel statement
  from net banking"). Never show a stack trace.
- The forecast stays conservative: income = lower of last-3-month avg and whole-period avg. Do not add ML to the
  forecast without evaluating it against this baseline.
- Money is shown in Indian format: `₹1,23,456` (`toLocaleString('en-IN')`), lakh shorthand `₹1.85L`.

## V3 classifier

Training happens in Python; the browser only predicts.

- Order in the app: owner override > setup payee (D15) > rule > model (probability >= 0.8) > "needs review"
  (show top 2 suggestions). Setup payees only match money out; salary, rent and EMI only near their usual amount.
- Model: scikit-learn `TfidfVectorizer(analyzer='char_wb', ngram_range=(3,5))` on the cleaned narration,
  plus direction, log(amount), day of month and rail as extra features, then `LogisticRegression` (one-vs-rest,
  `class_weight='balanced'`).
- Training data: `data/synthetic/*.csv` + rows the rules label with certainty + exported owner corrections.
  Never train on `data/labels/`.
- Export: `train.py` writes `public/model.json` (vocabulary, idf, coefficients, intercepts, class order, feature
  config, version, training date, row counts). Keep it under ~2 MB.
- Parity: text cleaning and features exist twice (Python for training, TypeScript for inference). Keep one
  shared spec in `ml/features.py` docstrings and add a test that runs 50 fixture narrations through both and
  checks the probabilities match to 1e-6. Mismatched features are the most likely silent bug.
- Learning loop: an owner correction applies instantly as a per-payee override. The ledger has "Export
  corrections" (CSV, same columns, source=correction); `train.py` includes `data/corrections/*.csv` on the next run.

## Evaluation — read before reporting any number

- NEVER report classifier accuracy on synthetic data. Train on synthetic + rule-labelled rows; test on
  `data/labels/` (real rows) only.
- Report macro-F1 and per-class F1, not plain accuracy (the data is ~88% `sales`; always guessing `sales` scores 88%).
- Always compare against baselines: majority class, rules only, model only, hybrid.
- Forecast: train on months 1-3, predict 4-6, report MAPE for inflow and outflow.
- Setup payees: `npm run eval:profile` simulates a setup from months 1-3, scores months 4-6, no model
  (it was trained on the synthetic files). Writes docs/profile_results.md; synthetic validation only.
- `evaluate.py` writes `docs/results.md` with the date, dataset, row counts and the command that produced them.
- Synthetic leave-one-file-out validation may be reported only when labelled "synthetic validation only, not a
  real-world score". `data/synthetic/CHANGELOG.csv` and `hdfc_kirana_bengaluru_v1.csv` are excluded (D8).
- Record new design decisions in `docs/decisions.md`; CI (`.github/workflows/ci.yml`) runs all tests on every push.

## Tests

- Every engine module has tests. Add a test for every bug fixed and every new bank format.
- Edge cases that must stay covered: header not on line 1, merged header cells, all date formats above,
  Dr/Cr single column, refunds/reversals, narrations with no payee (`UPI/CR`, `POS SETTLE`), 1-2 months of
  history, a payee seen once, partial first/last month, no balance column, empty file, PDF upload, 5,000+ rows.
- Fixtures use anonymized narrations only.

## Privacy

- Real statements never leave the browser and never go into Git. `data/real/` is gitignored.
- The owner's last statement is remembered in this browser's localStorage, one per account
  (`src/ui/savedStatement.ts`), so they don't re-upload every visit. Logging out and "Remove from this
  device" delete it.
- Category corrections: account holders' are saved on the server (payee key -> category, D16) and follow
  them to any device; guests' stay in this browser. `src/ui/useOverrides.ts` is the only place that writes them.
- The API never receives transactions or narrations. It may store: account, business profile, payee rules
  (name, category, typical amount/day) and category corrections. Anything more needs a decision in docs/decisions.md.
- API errors are JSON `{ error }` with a sentence a shop owner can act on; never a stack trace.
- Before any real row is saved to `data/labels/`: remove account numbers, phone numbers, personal names of
  individuals and full VPAs (keep the handle suffix, e.g. `xxxx@okhdfcbank`).

## UI

- App shell: sidebar navigation (bottom tab bar under 860px) with hash-routed pages. One job per page:
  - Overview: summary cards, cash-flow chart, upcoming payments, alerts, where money went.
  - Cash flow: money in vs out chart (forecast hatched, hover tooltip, click selects month), month detail,
    projected balance chart + forecast table.
  - Budget, Recurring, Transactions (ledger with per-payee category correction), Statement (upload + sample).
- Upload lives on the Statement page (and drag-and-drop anywhere), never in a page header.
- "Who are these?" (Overview): regular payees (money out, 2+ months) that only the model or nobody could sort
  (`src/engine/candidates.ts`). A role answer becomes a setup payee; Personal/Other become corrections.
- Light and dark themes via CSS variables. Must work at 400px width. Respect `prefers-reduced-motion`.
- First open shows the welcome page (sign up / log in) with "Try it with sample data" (guest mode, no account,
  marked "Sample data"). After sign-up: 3-step setup (business, people, suppliers/loans/bills), skippable after
  step 1. Profile is editable later on the "Your business" page (sidebar account link).
- Signed-in owners never see the sample. Until they upload, Overview is a home page (who Galla is, how it
  works, upload) and the other data pages show "No statement yet". Sample data is for guests only.
- API calls go through `src/api/client.ts` only; it turns every failure into a sentence for the owner.

## Working style

- Work in small steps: change, run tests, check in the browser, then continue.
- Keep engine and UI changes in separate commits where possible.
- When unsure about a finance rule (GST timing, what counts as a category), ask instead of guessing.
