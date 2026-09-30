# Design decisions

Short records of the choices that shape Galla: what was decided, why, and what it costs.
Newest last. Each one can be revisited; the "Revisit when" line says what would change it.

---

## D1. Everything runs in the browser, no backend

**Decision.** The statement is parsed, categorized and forecast entirely in the browser. No server,
no login, no analytics. Only the owner's category corrections are stored, in `localStorage`.

**Why.** A bank statement is the most sensitive file a shop owner has. If it never leaves the device,
there is nothing to leak, no data-protection burden and nothing to host.

**Cost.** No sync between devices, no multi-shop view, corrections live in one browser.

**Revisit when.** Owners ask for phone + laptop sync or an accountant view (see the roadmap in the README).

## D2. The engine is pure functions, separate from the UI

**Decision.** `src/engine/` has no React, DOM or `localStorage`. Same input, same output; "today" is
passed in, never read from the clock. `src/ui/` only displays engine output.

**Why.** Pure functions are easy to test (357 tests run in a few seconds) and can be reused anywhere:
a mobile app, a server, a WhatsApp bot.

**Cost.** A little more plumbing: the UI has to fetch files and pass them in.

## D3. Categories are decided in a fixed order: owner > rule > model > review

**Decision.** An owner correction always wins. Then a keyword rule (treated as certain). Then the ML
model, only if it is at least 80% sure. Otherwise the row is marked "Review" with the top 2 suggestions.

**Why.** Each step is more explainable than the next. The owner should never be overruled, rules are
predictable, and a model guess below 80% is worse than asking.

**Cost.** A rule that is too broad beats a correct model. Measured: the rule "money in via UPI = sales"
mislabels 41 synthetic rows the model alone gets right (`docs/results.md`, "Where the rules disagree").

**Revisit when.** Real labelled data shows a rule doing more harm than good; narrow or drop that rule.

## D4. Train in Python, predict in TypeScript, with a parity test

**Decision.** `ml/train.py` (scikit-learn) trains the model and exports its numbers to `public/model.json`.
`src/engine/classifier.ts` rebuilds the same features and predicts. The feature spec lives once, in the
`ml/features.py` docstring. A test runs 50 inputs through both and requires the probabilities to match
to 1e-6.

**Why.** Python has the ML tools; the browser can only run JavaScript. Keeping the model as plain numbers
means no ML runtime in the page.

**Cost.** Features are written twice. The parity test exists because a mismatch would be silent.

## D5. A small linear model, not a large one

**Decision.** Character 3-5 gram TF-IDF on the cleaned narration + direction, log amount, day of month
and payment rail, then one-vs-rest logistic regression with balanced class weights.

**Why.** Bank narrations are short, messy codes (`UPI/CR/…/SWIG`); character pieces handle spelling
variants. The model file is 232 KB, predicts instantly in the browser, and each weight can be inspected.
Balanced weights stop the model from favouring `sales` (about 69% of rows).

**Revisit when.** Real labelled data shows the linear model hitting a ceiling.

## D6. Evaluation only counts on real, hand-labelled rows

**Decision.** `data/labels/` (real rows, anonymized) is the only test set, and it is never trained on.
Synthetic data is used for training and for leave-one-file-out validation, always reported as
"synthetic validation only, not a real-world score". Macro-F1 is reported, not plain accuracy, next
to baselines (always `sales`, rules only, model only, hybrid).

**Why.** The synthetic files come from one template, so scores on them are optimistic. Always guessing
`sales` already gets about 66% accuracy, which is why accuracy alone is misleading.

**Status.** `data/labels/` is still empty, so there is no real-world score yet.

## D7. A sale reversal going out is labelled `other` (decided 2026-09-29)

**Decision.** A withdrawal that the synthetic data labels `sales` (e.g. `UPI REVERSAL/…` money going
back to a customer) is trained and scored as `other`. The CSV files are left unchanged; `train.py`
applies this when loading.

**Why.** The app never gives money out an income category. Options considered: keep `sales` and
subtract it from sales (needs changes in budget and forecast), or add a new category (needs type and
UI changes). `other` needs no engine change.

**Cost.** Gross sales look slightly higher than true net sales (reversals are about 1% of sales).

## D8. Two synthetic files are left out of training (decided 2026-09-29)

**Decision.** `CHANGELOG.csv` (an edit log, not a statement) and `hdfc_kirana_bengaluru_v1.csv`
(older generator: no `hard_case` column, 13 refunds on the wrong side or with the wrong category)
are excluded. Found by `ml/check_data.py` before any training.

## D9. The forecast is deliberately conservative

**Decision.** Expected income = the lower of the last-3-month average and the whole-period average.
Expenses = recurring payments + the last-3-month average of the rest. No ML in the forecast unless it
beats this baseline on held-out months.

**Why.** For a shop owner, an optimistic forecast is dangerous (they spend money they won't have);
a slightly pessimistic one is safe.

**Status (backtest 2026-09-30, [forecast_results.md](forecast_results.md)).** Only the *income* side is
conservative. On the synthetic statements, spending rises over time and the forecast under-estimates it,
so the closing balance was overstated in 5 of 7 files. Candidate fix, not yet decided: forecast outflow
from the *higher* of the recent and whole-period averages, then re-run `npm run eval:forecast`.

## D10. The owner teaches the model

**Decision.** A category change in the ledger applies instantly to every payment to that payee.
"Export corrections" downloads them as CSV; `train.py` includes `data/corrections/*.csv` on the next run.

**Why.** The owner knows their payees better than any model. The fix is instant for them and
improves the model for everyone later.

## D11. Multi-page app layout; 3D towers replaced by a 2D chart (2026-09-30)

**Decision.** The single long dashboard became a sidebar app with six pages (Overview, Cash flow,
Budget, Recurring, Transactions, Statement). The three.js "month towers" were removed and replaced by
a 2D grouped bar chart (money in vs money out, forecast months hatched). Upload moved from the
header to the Statement page; drag-and-drop still works anywhere.

**Why.** Owner feedback: one page carried everything and felt crowded, and the 3D towers were hard to
read. Bars you can compare side by side answer "did more go out than came in?" faster than a 3D scene.
The per-category breakdown is still shown, in the month detail panel and "Where money went".
Dropping three.js also removed the largest dependency and the WebGL fallback path.

## D12. A small API for accounts and business profiles; statements stay in the browser (2026-09-30)

**Decision.** Add `server/`: Node + Hono + TypeScript, PostgreSQL with Drizzle migrations, email and
password accounts via better-auth. The server stores accounts, the business profile and payee rules.
It never receives the bank statement or individual transactions; parsing and categorising stay in the
browser.

**Why.** The course requires a backend, and a business profile (employees, landlord, suppliers, loans)
fixes the model's cold start: on the first upload Galla can already tell salary from supplier payments.
Keeping transactions off the server keeps the original privacy promise and keeps the engine unchanged.

**Details.**
- *Bearer tokens, not cookies.* The web app (GitHub Pages) and the API are on different sites, where
  browsers may block cookies. better-auth's bearer plugin returns the session token in a `set-auth-token`
  header and the app sends it as `Authorization: Bearer`.
- *PGlite for local dev and tests.* A real Postgres compiled to WebAssembly: no Docker to start, every
  test file gets a fresh in-memory database. Production uses node-postgres against Neon. Same SQL,
  same migrations.
- *Auth is a library, not our code.* Password hashing, sessions and rate limits are better-auth's job.
  Its telemetry is switched off explicitly.

## D13. Setup asks about regular payees, stored as payee rules (2026-09-30)

**Decision.** After sign-up the owner goes through three short steps: business (name, type, city,
employees), people paid monthly (employees with salary and pay day, landlord), then suppliers, loans
and bills. Each person or firm is saved as a *payee rule*: role (employee, landlord, supplier, lender,
utility), name, typical amount, day of month and an optional UPI id. Each role maps to one category.
Steps 2 and 3 can be skipped; everything is editable later on "Your business".

**Why.** Before this, the first upload depended on keyword rules and the model guessing from text, and
names like "SURESH PAWAR" gave it nothing to go on. The owner already knows who these people are; a
2-minute form turns that into exact answers. Phase 3 matches these rules against transactions.

**Details.**
- *Guest mode stays.* "Try it with sample data" needs no account, so the demo works even if the API
  is down and examiners can look without signing up.
- *Business types and roles are defined once* in `src/engine/profile.ts`; the API validates against
  the same lists.
- *Found by the browser test, not the unit tests:* logout sent a POST without a body, which the auth
  server rejects with 415 over real HTTP, so the session stayed valid. The client now sends `{}`, and
  `server/tests/http.test.ts` runs requests over a real socket to catch this kind of difference.

## D14. Signed-in owners start on a home page; their statement is remembered on the device (2026-09-30)

**Decision.** A signed-in owner never sees the fictional sample shop. Until they upload a statement,
Overview is a home page (what Galla does, three steps, what it already knows from setup, how to download
a statement, the upload box) and Cash flow, Budget, Recurring and Transactions say "No statement yet".
The sample stays for guests ("Try it with sample data" before signing up).

Once uploaded, the parsed statement is kept in this browser's localStorage under the owner's account id,
so opening Galla again shows their dashboard. Logging out, or "Remove from this device" on the Statement
page, deletes it. Category corrections are stored per account too (guests keep the old key).

**Why.** Owner feedback: after creating an account they landed on someone else's (sample) numbers, which
is confusing. And with accounts, asking for a re-upload on every visit would make the product feel broken.

**Privacy.** The statement still never reaches the server. Keeping it in the browser is the same trust
level as reading it there; clearing it on logout covers shared computers. A saved statement is validated
on load and ignored if it is not well-formed.

## D15. Setup payees sort money out before keyword rules (2026-09-30)

**Decision.** A withdrawal that matches a payee the owner named at setup takes that payee's category
(employee -> salary, landlord -> rent, supplier -> suppliers, lender -> emi, bill -> utilities).
Order: owner correction > setup payee > keyword rule > model (>= 0.8) > needs review.
Matching (`src/engine/profileMatch.ts`): a UPI id alias, or every word of the name in the narration,
allowing a truncated surname (SURESH PAWA), an initial (RAJESH K) and a joined spelling that is a whole
word (RAJESHK). Money coming in is never matched. For salary, rent and EMI, a payment below 40% or above
2.5x the usual amount is left to the rules, the model or the owner. Matched rows use the owner's spelling
of the name, so spelling variants group as one payee.

**Why.** "Suresh Pawar is my employee" is more specific than any keyword: "SHARMA ENTERPRISES" looks like
a supplier to the rules but the owner knows it is the landlord.

**Evidence (docs/profile_results.md, synthetic validation only).** Setup built from months 1-3, scored on
months 4-6, no model: withdrawals sorted automatically 64.5% -> 79.9%, correct-when-sorted stays 100%,
suppliers F1 0.757 -> 0.970, 110 rows fixed and none made worse.

**Found by the evaluation.** The first simulation let the "owner" type names like "Salary" and "Shop Rent"
(keywords in disguise), which inflated the no-keyword score; it now only uses names visible in the
narration. With that fixed, small UPI payments to an employee (Rs 500-1,300, labelled personal) were
being called salary; the amount window for fixed payees came from that.

**Not done.** Setup matches are not exported as training corrections: they are name matches, not
row-by-row owner decisions, so a wrong match could teach the model a mistake.

## D16. Corrections live on the account; "Who are these?" asks about regular payees (2026-09-30)

**Decision.** An account holder's category corrections (payee key -> category) are stored on the server
(`correction` table) and loaded at sign-in, so they follow the owner to another phone or computer. The
change shows immediately and is saved in the background; if saving fails it is rolled back and the owner
is told. Corrections still on the device from before are uploaded once. Guests keep theirs in the browser.

After an upload, Overview shows "Who are these?": payees paid in 2+ months that only the model or nobody
could sort (`src/engine/candidates.ts`), unsorted ones first, then by money involved, at most 8. One tap:
- a role (Employee, Landlord, Supplier, Loan / EMI, Bill) saves a setup payee (D15), so salary, rent and
  EMI keep the usual-amount check; if that name would not match the payee's narrations, a plain
  correction is added too so the answer still applies;
- Personal or Other saves a correction;
- "Not now" hides it on this device.

**Why.** Typing every employee and supplier at setup is the step owners skip. Asking about the few
payees Galla actually saw, with one tap each, gets the same information with far less effort, and
corrections made on the shop computer should not vanish on the owner's phone.

**Privacy.** The server gets payee keys (a payee's name in lower case) and categories. It already held
payee names from setup (D13); it still never receives transactions, amounts per payment or narrations.

**Found in the browser test.** The first confirmation said "3 payments moved to Salaries", counted before
the setup payee applied: one of those (tea money) did not move and a truncated spelling that did was not
counted. The message no longer states a count.


## D17. A regular payment is forecast at its usual amount, not total ÷ months (2026-09-30)

**Decision.** A monthly recurring payment is forecast as (usual number of payments in a month, the
median) × (average payment). Before, it was the total paid ÷ months seen, which turns a one-off extra
payment into a permanent monthly cost. Also new: an alert when the same payee is paid the same amount
twice on one day (₹2,000 or more), and a keyword rule for state electricity and water boards.

**Found by.** An owner's restaurant statement (Jul-Sep 2026) forecast −₹58,993 for the next 3 months.
Rent (₹56,000 on the 28th) was paid twice on 28 Sep, so rent was forecast at ₹74,667 a month; that
alone explained ₹56,000 of the shortfall. After the fix the outlook is about −₹3,000: July lost
₹1.07L, August ₹26k and September made ₹75k, so the small negative is real.

**Check.** This matches the forecast's own spec ("recurring payments at their usual amount"). For a
payee paid once every month the number is unchanged, so the prototype parity test, the forecast
backtest (docs/forecast_results.md) and the synthetic rule labels are all unchanged.

## D18. Employees by name, every utility biller, and failed payments skipped (2026-09-30)

**Decision.**
- *Payee names.* A payment-type word before a name is not the payee: `UPI/SALARY/VIKAS` is "Vikas",
  `NEFT/RENT/MAHESH CHAND` is "Mahesh Chand". A segment made only of such words ("SHOP RENT") is still
  used when nothing else names the payee. Month names are not names ("RENT SHOP APRIL" stays as is),
  and an initial after a name is kept ("RAJESH K"), so Rajesh K and Rajesh M stay two people.
- *Utility billers.* `src/engine/billers.ts` lists the electricity boards of every state, water boards
  and LPG / piped-gas companies, matched as whole words. The rule runs before the EMI rule, because
  electricity is often paid by auto-debit ("NACH DR/TATA POWER").
- *Status column.* When a statement has a status column (payment-app exports), rows marked failed,
  declined, rejected or cancelled are skipped: the money never moved. Pending rows are kept; "reversed"
  is not skipped because banks show a reversal as its own row.

**Found by.** An owner's restaurant statement with 10 employees: all ten became one payee "Salary", so
no salary showed as a recurring cost; LPG bills needed review; a failed ₹21,500 salary and a failed
₹12,750 EMI were counted as spent. The 3-month outlook moved from −₹32,825 to −₹11,775 a month.

**Checks.** The new rule changes no synthetic training label; the forecast backtest and the setup-payee
evaluation are unchanged; the prototype parity test normalises the one intended naming difference and
still requires identical grouping, forecast, budget and alerts. This is done with keyword rules, not by
retraining the model: rules recognise a fixed list of company names every time, the model only guesses.

## D19. Forecast next month only; the budget starts from history and the owner can change it (2026-09-30)

**Decision.** The app forecasts next month only (was 3 months). The Budget page suggests an amount per
category from the statement (typical month, never below fixed payments) and the owner can replace any
suggestion with their own amount, saved to their account (`budget_limit` table; guests: the browser).
A plan card shows expected money in against the total budget, and, separately, against usual spending
(the Overview number). An alert fires when the owner's own budget spends more than the expected income.
A quarterly payment due 2-3 months out gets a "Coming up" alert, since it is no longer in the forecast.

**Why.** Owner feedback: "the forecast is the same for the next three months". It was: every forecast
month used the same averages (only a quarterly payment could change one), so months 2 and 3 repeated
month 1 and looked like information they were not. Owners plan month by month; a budget they can adjust
is more useful than two repeated forecasts.

**Evaluation.** docs/forecast_results.md is now a rolling next-month backtest (months 1..k -> k+1,
k = 3, 4, 5; 21 predictions). Money-in error 8.1% vs 8.3% for a plain 3-month average and 10.0% for
repeating last month. It also finally exercises D9: with more than 3 months of history the conservative
rule lowered the income forecast in 11 of 21 predictions. Closing balance overstated in 10 of 21, so the
forecast is not yet reliably on the safe side (synthetic validation only).

**Parity.** `analyze` still accepts `horizon`; the prototype parity test runs with `horizon: 3` and still
matches exactly.

