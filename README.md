# Galla — cash planning from bank statements

Galla turns a small Indian business's bank statement (CSV or Excel) into categorized transactions,
recurring payments, monthly budget limits, a 3-month cash forecast and plain-language alerts,
with a 3D month-by-month view of money in and out.

Everything runs in the browser. There is no backend, no login and no tracking: the statement never
leaves the device. Only the owner's category corrections (and the theme) are saved, in `localStorage`.

BTech final project (solo).

## Features

- **Upload** a CSV, XLS or XLSX statement by button or drag-and-drop. The built-in sample statement
  (a fictional kirana store in Pune) loads on first open, marked "Sample data". PDFs get a friendly
  message asking for the Excel download instead.
- **Summary cards**: average money in and out, bank balance, next-3-months net, with sparklines.
- **3D month towers** (three.js): money in vs money out stacked by category, forecast months as
  glass. Bars grow on load, hover glows and shows a tooltip, clicking a tower or month flies the
  camera to it, the legend hides/shows categories. Respects `prefers-reduced-motion`; falls back
  to a 2D chart when WebGL is unavailable.
- **Month detail** panel, **projected balance** chart and forecast table, **alerts**,
  **budget** table and **recurring payments**.
- **Transaction ledger** with search and filters. Changing a category applies to every payment to
  that payee; "Export corrections" downloads the changes as CSV for the next model training run.
- Light and dark themes, works down to 400px phone width.

## Setup

Requires Node.js 20+ (developed on Node 24).

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # Vitest (must pass before any commit)
npm run build      # type-check + production build into dist/
npm run preview    # serve the production build
```

Open `http://localhost:5173/?no3d` to see the fallback used when WebGL is unavailable.

### ML (training only, not part of the web build)

```bash
cd ml
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

## Architecture

```
src/
  engine/            Pure, deterministic functions. No React, no DOM, no localStorage.
    parse.ts         CSV/Excel rows -> RawTxn[]: header detection, dates, amounts, Dr/Cr
    excel.ts         .xls/.xlsx bytes -> rows (SheetJS), loaded only when needed
    narration.ts     payment rail (UPI/NEFT/IMPS/RTGS/NACH/ATM/charges...) + payee
    rules.ts         keyword rules -> category
    categorize.ts    owner override > rule > model (p >= 0.8) > needs review
    recurring.ts     monthly + quarterly payment detection
    forecast.ts      3-month conservative forecast + closing balance
    budget.ts        per-category monthly limits
    alerts.ts        plain-language alerts
    analyze.ts       ties the above together into one Analysis
    corrections.ts   owner corrections -> CSV (source=correction)
    sample.ts        built-in sample statement (seeded, identical on every load)
    types.ts         shared types and the fixed category ids
  ui/                React components. They read engine output and never re-implement logic.
    App.tsx          state: statement, owner overrides, selection, filters
    city/CashCity.tsx  the 3D view (@react-three/fiber + drei + postprocessing), lazy-loaded
    components/      summary cards, month detail, charts, alerts, budget, recurring, ledger
tests/
  engine/            Vitest tests for every engine module
  fixtures/          anonymized bank-format samples (SBI, HDFC, ICICI, Axis, Kotak) + narrations
prototype/           earlier single-file prototype (reference; the engine was ported from it)
ml/                  Python training + evaluation
data/
  synthetic/         generated statements (source=synthetic)
  labels/            hand-labelled real rows, the only test set
  real/              gitignored; real statements never go into Git
```

Data flow: file -> `parse` -> `RawTxn[]` -> `enrich` (rail, payee, category) -> `analyze`
(months, recurring, forecast, budget, alerts) -> React UI.

The engine takes no hidden inputs (no `Date.now()`, no storage), so the same statement always gives
the same result. `tests/engine/parity.test.ts` runs the original `prototype/engine.js` alongside
the TypeScript port and checks that they agree on the sample and synthetic statements.

### Reading statements

The parser does not assume a bank. It looks for the header row in the first 60 rows (it need not be
line 1), merges two-line or merged-cell headers, and maps columns by name. It accepts:

- dates as `dd/mm/yy`, `dd/mm/yyyy`, `dd-Mon-yyyy`, `dd Mon yyyy`, ISO and Excel serial numbers;
- amounts with commas, `₹`, `Rs`, `INR`, `Dr`/`Cr` suffixes, minus signs or brackets;
- separate withdrawal/deposit columns, or one amount column with a Dr/Cr column (or signed amounts);
- an optional balance column (overdrawn balances become negative);
- narrations wrapped onto a continuation line.

Errors are written for a shop owner, e.g. "We couldn't find the transaction table in this file…
Download the Excel statement from net banking and try again." A stack trace is never shown.

## How categorization works

Categories (ids are fixed): income `sales`, `other_income`; expense `suppliers`, `salary`, `rent`,
`utilities`, `emi`, `tax`, `personal`, `charges`, `other`.

Each transaction is decided in this order:

1. **Owner override.** A correction in the ledger is stored per payee and direction
   (e.g. `agarwaltraders:D`), so it applies to every payment to that payee. It only counts if it
   matches the direction (an income category for money in).
2. **Rules** (`src/engine/rules.ts`). An ordered list of keyword patterns, each for money in or
   money out; the first match wins and is treated as certain. For example:
   - `CHRG`, `SMS ALERT`, `QR RENTAL` → `charges`
   - `GST`, `CPIN`, `CBDT`, `ADVANCE TAX` → `tax`
   - `NACH`, `ACH`, `EMI`, `LOAN`, `BAJAJ FIN` → `emi`
   - `RENT`, `LEASE` → `rent`; `SALARY`, `WAGES` → `salary`
   - `BESCOM`, `MSEDCL`, `AIRTEL`, `JIO`, `FIBERNET` … → `utilities`
   - `ZOMATO`, `NETFLIX`, `MYNTRA`, `AMAZON` … → `personal`
   - `TRADERS`, `DISTRIBUT`, `WHOLESALE`, `METRO CASH`, `UDAAN` … → `suppliers`
   - `ATM`, `CASH WDL` → `other` (kirana owners often pay suppliers in cash)
   - money in with `REFUND`, `REVERSAL`, `INTEREST`, `CASHBACK` → `other_income`
   - money in with `SETTLEMENT`, `PAYTM`, `BHARATPE`, `CASH DEP`, `UPI`, `POS` → `sales`
3. **Model** (V3, planned). A scikit-learn classifier trained in `ml/` and exported to
   `public/model.json`; the browser only predicts. Used when its probability is at least 0.8.
   The hook is the optional `Classifier` argument of `enrich`/`categorize`.
4. **Needs review.** Nothing was confident. The row keeps a safe default (`sales` for money in,
   `other` for money out) so totals still add up, and is marked "Review" in the ledger with the
   model's top 2 suggestions when a model is loaded.

Payee extraction removes rail words, reference numbers, IFSC codes and VPAs from the narration
(`UPI/DR/123/AGARWAL TRADERS/...` → "Agarwal Traders"). Narrations with no payee
(`UPI/CR/717889`) share one name per rail ("Unnamed UPI payment").

## How the numbers are worked out

- **Months**: a month the statement covers less than 80% of is marked partial and left out of
  averages, budget and forecast.
- **Recurring**: same payee, amount within ±35% (coefficient of variation), day of month within
  about 5 days, seen in 3+ months and still active → monthly. One payment every 3 months → quarterly.
  ATM withdrawals are never recurring.
- **Forecast (conservative)**: income per category = the lower of the last-3-month average and
  the whole-period average. Expenses = monthly recurring payments + quarterly payments in the months
  they fall due + the last-3-month average of everything else. Closing balance is carried forward.
- **Budget**: suggested limit = median month, never below the category's fixed payments, rounded
  up to ₹500. "Over" means the latest full month is more than 10% above the limit.
- **Alerts**: forecast shortfalls, balance below one month of fixed costs, sales trend, new
  monthly payments, budget overruns, personal spending, bank charges, partial months, short history.

Money is shown in Indian format: `₹1,23,456`, short form `₹1.85L`.

## Tests

`npm test` runs 284 tests covering every engine module, including: header not on line 1, merged
header cells, every date format above, Dr/Cr single column, refunds and reversals, narrations with
no payee, 1–2 months of history, a payee seen once, partial first/last month, no balance column,
empty file, PDF upload, 5,000+ rows, Excel (`.xlsx` and `.xls`), and five bank layouts.

## Privacy

Real statements never leave the browser and never go into Git (`data/real/` is gitignored).
Rows saved to `data/labels/` must have account numbers, phone numbers, personal names and full
VPAs removed first.

## Tech

Vite, React, TypeScript (strict), three.js with @react-three/fiber, drei and postprocessing,
SheetJS for Excel, Vitest. Fonts (Manrope, JetBrains Mono, Unbounded) are bundled, so the page
makes no third-party requests.
