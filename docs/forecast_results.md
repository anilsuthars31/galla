# Forecast backtest (next month)

- **Date:** 2026-09-30
- **Command:** `npm run eval:forecast`
- **Data:** 7 synthetic statements in `data/synthetic/` (`CHANGELOG.csv`, `hdfc_kirana_bengaluru_v1.csv` excluded)
- **Method:** the app forecasts next month only (D19). Rolling test: give it months 1..k and predict month k+1, for k = 3, 4, 5, so 21 predictions (3 per file), each compared with what actually happened. Categories from rules only, so nothing from the predicted month leaks in.
- **MAPE** = average of |forecast − actual| ÷ actual. **Bias** = average signed error: negative means the forecast was lower than reality.

> Synthetic statements only, not a real-world score. Each file follows a scripted pattern (stable, growth, one loss month, volatile…), so real statements will be noisier.

## Summary (average over all predictions)

| Method | Inflow MAPE | Inflow bias | Outflow MAPE | Outflow bias | Closing balance error | Balance not overstated |
|---|---|---|---|---|---|---|
| Galla (conservative) | 8.1% | −0.8% | 6.0% | −0.8% | −1.1% | 11 of 21 |
| Plain 3-month average | 8.3% | +0.1% | 5.9% | −1.2% | +1.3% | 9 of 21 |
| Repeat last month | 10.0% | +0.4% | 6.9% | −0.1% | −0.2% | 7 of 21 |

## Findings

- **The conservative income rule (D9) lowered the income forecast in 11 of 21 predictions** (it can only differ from a plain average with more than 3 months of history). Inflow error: 8.1% for Galla vs 8.3% for a plain 3-month average.
- The next month's closing balance was overstated in 10 of 21 predictions: about as often too high as too low, so it is not reliably on the safe side yet.
- **Why one month (D19):** every forecast month used the same averages, so months 2 and 3 only repeated month 1. Big quarterly payments beyond next month are shown as a separate "Coming up" alert instead.

## MAPE by amount of history

| History → predicted | Galla (conservative): inflow | outflow | Plain 3-month average: inflow | outflow | Repeat last month: inflow | outflow |
|---|---|---|---|---|---|---|
| 3 months → month 4 (July 2026) | 11.1% | 5.5% | 11.1% | 5.5% | 11.4% | 6.0% |
| 4 months → month 5 (August 2026) | 8.5% | 6.9% | 8.5% | 7.0% | 8.5% | 5.3% |
| 5 months → month 6 (September 2026) | 4.6% | 5.6% | 5.4% | 5.3% | 10.2% | 9.3% |

## MAPE per file (average of its predictions)

| File | Galla (conservative): inflow | outflow | Plain 3-month average: inflow | outflow | Repeat last month: inflow | outflow |
|---|---|---|---|---|---|---|
| 01_stable_88_92_kirana_bengaluru | 4.8% | 6.2% | 6.3% | 6.2% | 8.1% | 9.5% |
| 02_tight_93_97_pharmacy_pune | 5.1% | 3.6% | 4.9% | 3.2% | 9.1% | 7.0% |
| 03_growth_80_90_salon_hyderabad | 4.0% | 2.4% | 4.0% | 2.8% | 6.2% | 5.6% |
| 04_one_loss_month_kirana_mysuru | 11.8% | 8.0% | 10.9% | 7.8% | 8.0% | 4.4% |
| 05_volatile_pharmacy_bengaluru | 11.4% | 9.4% | 11.4% | 9.4% | 14.3% | 10.0% |
| 06_cashflow_pressure_salon_chennai | 10.5% | 8.4% | 11.9% | 8.4% | 12.2% | 5.5% |
| 07_mixed_realistic_kirana_hyderabad | 8.8% | 4.1% | 8.8% | 3.7% | 12.2% | 6.2% |
