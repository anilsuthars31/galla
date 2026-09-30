# Business setup (named payees): does it help the first upload?

- **Date:** 2026-09-30
- **Command:** `npm run eval:profile`
- **Data:** 7 synthetic statements in `data/synthetic/` (`CHANGELOG.csv`, `hdfc_kirana_bengaluru_v1.csv` excluded, D8)
- **Test rows:** 715 withdrawals from months 4-6 (money out only: setup payees never match money in). Of these, 26 are marked `hard_case`.
- **Simulated setup:** from months 1-3 only, every payee an owner would name (salary, rent, EMI, bills, suppliers) that was paid in 2+ different months, by a name visible in the statement. 52 payees across 7 files.
- **Names:** the simulated owner types the name visible in the narration (`SALARY/RAJESH K/UPI` → "Rajesh K"). Payments whose narration shows no name (`SHOP RENT`, `ELECTRICITY BILL`, a bare UPI id) get no setup payee, because a real owner’s spelling could not match them either.
- **No model** in any condition: `public/model.json` was trained on these same files, so it would inflate every number.
- **Rows left for review count as wrong** in accuracy and F1 (the owner still has to sort them by hand).

> Synthetic validation only, not a real-world score. Synthetic narrations are keyword-friendly (SALARY/, SHOP RENT, LOAN EMI, …), and the simulated owner spells names exactly as the bank does (real owners will write "Rajesh Kumar" where the bank prints "RAJESH K"; the matcher handles initials and truncation, but not nicknames). Condition C is the closer stand-in for real statements where payments to people carry no keyword.

## Summary

| Condition | Sorted automatically | Correct when sorted | Accuracy (review = wrong) | Macro-F1 | Hard cases correct |
|---|---|---|---|---|---|
| A. Keyword rules only (cold start today) | 64.5% | 100.0% | 64.5% | 0.845 | 0.0% |
| B. Setup payees + keyword rules (new) | 79.9% | 100.0% | 79.9% | 0.869 | 0.0% |
| C. Setup payees only (statement with no keywords) | 53.1% | 100.0% | 53.1% | 0.307 | 0.0% |

## What changed between A and B

- **110** of 715 test rows got a different category (or left "needs review") once the setup was added.
- **270** more kept the same category, now decided by the setup payee instead of a keyword rule.
- **110** went from wrong or "needs review" to correct; **0** went from correct to wrong.

Examples fixed by the setup:

- `NEFT/BALAJI FMCG/326382`: needs review → **suppliers** (suppliers expected)
- `NEFT/BALAJI FMCG/323769`: needs review → **suppliers** (suppliers expected)
- `NEFT/BALAJI FMCG/230097`: needs review → **suppliers** (suppliers expected)
- `IMPS/BALAJIFMCG/572867`: needs review → **suppliers** (suppliers expected)
- `IMPS/BALAJI FMCG/598480`: needs review → **suppliers** (suppliers expected)
- `NEFT/BALAJI FMCG/183679`: needs review → **suppliers** (suppliers expected)

## Per-class F1

| Class | Test rows | A | B | C |
|---|---|---|---|---|
| charges | 42 | 0.988 | 0.988 | 0.000 |
| emi | 21 | 0.976 | 0.976 | 0.000 |
| other | 84 | 0.337 | 0.337 | 0.000 |
| personal | 105 | 0.696 | 0.696 | 0.000 |
| rent | 21 | 0.895 | 0.895 | 0.000 |
| salary | 42 | 0.988 | 0.988 | 0.976 |
| suppliers | 330 | 0.757 | 0.970 | 0.970 |
| tax | 28 | 0.982 | 0.982 | 0.000 |
| utilities | 42 | 0.988 | 0.988 | 0.817 |

`other` and `personal` have no setup role (the setup does not ask about them), so C cannot score them; `tax` and `charges` are covered by keyword rules.

## Setup payees per file

| File | Payees named | Test rows |
|---|---|---|
| 01_stable_88_92_kirana_bengaluru | 8 (Metro Wholesale, Balaji Fmcg, Manoj S, Bescom, Shree Distributors, Act Fibernet, Nandini Traders, Rajesh K) | 101 |
| 02_tight_93_97_pharmacy_pune | 7 (Healthplus Wholesale, Lifecare Pharma, Medico Distributors, Rajesh K, Manoj S, Sunrise Medicals, Act Fibernet) | 102 |
| 03_growth_80_90_salon_hyderabad | 7 (Style Distributors, Cosmo Care, Rajesh K, Manoj S, Beauty Pro Supply, Act Fibernet, Salon Mart) | 102 |
| 04_one_loss_month_kirana_mysuru | 8 (Metro Wholesale, Rajesh K, Manoj S, Balaji Fmcg, Bescom, Act Fibernet, Shree Distributors, Nandini Traders) | 102 |
| 05_volatile_pharmacy_bengaluru | 8 (Healthplus Wholesale, Medico Distributors, Sunrise Medicals, Rajesh K, Manoj S, Lifecare Pharma, Bescom, Act Fibernet) | 100 |
| 06_cashflow_pressure_salon_chennai | 7 (Salon Mart, Beauty Pro Supply, Style Distributors, Rajesh K, Manoj S, Act Fibernet, Cosmo Care) | 105 |
| 07_mixed_realistic_kirana_hyderabad | 7 (Metro Wholesale, Shree Distributors, Balaji Fmcg, Rajesh K, Manoj S, Act Fibernet, Nandini Traders) | 103 |
