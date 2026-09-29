# Forecast backtest

- **Date:** 2026-09-30
- **Command:** `npm run eval:forecast`
- **Data:** 7 synthetic statements in `data/synthetic/` (`CHANGELOG.csv`, `hdfc_kirana_bengaluru_v1.csv` excluded)
- **Method:** give the app only months 1-3 (April 2026–June 2026), forecast months 4-6 (July 2026, August 2026, September 2026), compare with what actually happened. Categories from rules only, so nothing from the test months leaks in.
- **MAPE** = average of |forecast − actual| ÷ actual. **Bias** = average signed error: negative means the forecast was lower than reality.

> Synthetic statements only, not a real-world score. Each file follows a scripted pattern (stable, growth, one loss month, volatile…), so real statements will be noisier.

## Summary (average over files)

| Method | Inflow MAPE | Inflow bias | Outflow MAPE | Outflow bias | Closing balance error | Balance not overstated |
|---|---|---|---|---|---|---|
| Galla (conservative) | 9.6% | +0.8% | 6.7% | −2.2% | +9.7% | 2 of 7 |
| Plain 3-month average | 9.6% | +0.8% | 6.7% | −2.2% | +9.7% | 2 of 7 |
| Repeat last month | 10.8% | +0.7% | 6.9% | +1.4% | −11.0% | 3 of 7 |

## Findings

- **With 3 months of history, Galla's income forecast equals the plain 3-month average.** The rule "lower of the last-3-month and whole-period average" (docs/decisions.md D9) only differs from a plain average when there are more than 3 months to average over, so this backtest cannot show its protective effect.
- **The closing balance was overstated in 5 of 7 files** (01_stable_88_92_kirana_bengaluru, 02_tight_93_97_pharmacy_pune, 03_growth_80_90_salon_hyderabad, 05_volatile_pharmacy_bengaluru, 07_mixed_realistic_kirana_hyderabad). The forecast is not on the safe side here: outflow was under-forecast by 2.2% on average, because spending in these files rises over time (e.g. the "growth" file moves from 80% to 90% of income spent). A forecast that overstates the balance is the risky direction for a shop owner.
- **Possible fix to evaluate next (not made):** forecast outflow from the higher of the recent and whole-period averages, mirroring the income rule, then re-run this backtest. It is a finance rule, so it needs the owner-side decision first.

## MAPE per file

| File | Galla (conservative): inflow | outflow | Plain 3-month average: inflow | outflow | Repeat last month: inflow | outflow |
|---|---|---|---|---|---|---|
| 01_stable_88_92_kirana_bengaluru | 6.3% | 4.8% | 6.3% | 4.8% | 15.5% | 14.7% |
| 02_tight_93_97_pharmacy_pune | 4.6% | 3.4% | 4.6% | 3.4% | 5.3% | 3.9% |
| 03_growth_80_90_salon_hyderabad | 5.2% | 3.9% | 5.2% | 3.9% | 5.6% | 4.4% |
| 04_one_loss_month_kirana_mysuru | 14.2% | 11.5% | 14.2% | 11.5% | 18.4% | 5.9% |
| 05_volatile_pharmacy_bengaluru | 17.2% | 9.1% | 17.2% | 9.1% | 14.9% | 8.3% |
| 06_cashflow_pressure_salon_chennai | 10.9% | 10.6% | 10.9% | 10.6% | 8.5% | 4.2% |
| 07_mixed_realistic_kirana_hyderabad | 8.5% | 3.7% | 8.5% | 3.7% | 7.7% | 6.5% |

## Closing balance at the end of September 2026

| File | Actual | Galla (conservative) | Plain 3-month average | Repeat last month |
|---|---|---|---|---|
| 01_stable_88_92_kirana_bengaluru | ₹6.53L | ₹7.09L | ₹7.09L | ₹7.07L |
| 02_tight_93_97_pharmacy_pune | ₹4.13L | ₹4.54L | ₹4.54L | ₹4.31L |
| 03_growth_80_90_salon_hyderabad | ₹9.56L | ₹11.42L | ₹11.42L | ₹10.67L |
| 04_one_loss_month_kirana_mysuru | ₹4.69L | ₹3.81L | ₹3.81L | ₹1.40L |
| 05_volatile_pharmacy_bengaluru | ₹5.91L | ₹7.84L | ₹7.84L | ₹7.59L |
| 06_cashflow_pressure_salon_chennai | ₹2.63L | ₹2.40L | ₹2.40L | ₹1.23L |
| 07_mixed_realistic_kirana_hyderabad | ₹4.57L | ₹5.73L | ₹5.73L | ₹4.30L |
