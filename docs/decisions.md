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
