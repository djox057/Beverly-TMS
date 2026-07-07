## Goal
Make the "Avg Dispatcher Salary" chart tooltip and the "Dispatcher averages" table match the exact salary shown on the Dispatcher Salaries list (leave the Dispatcher Salaries list untouched).

## Where the gap comes from
For Vuk Jurisevic‑Jerry, June 2026:

- Dispatcher Salaries list = $4,872
  - freight $224,794.50 × 1% = $2,247.95
  - cut $51,072.50 × 5% = $2,553.63
  - food allowance (Kragujevac) = $70
  - performance bonus / extra days / lost days / adjustments = $0
  - total = $4,871.58 → $4,872 ✓
- Chart tooltip = $4,790 → missing food allowance (+ small rounding drift from how canceled/TONU orders are bucketed).
- Averages table = $2,598 → this is `avgSalary = sum(monthlySalary) / monthCount` over the whole period, so a low early month (e.g. Nov 2025 ~$1,700) drags the number down. It also doesn't include food allowance / extra days / lost days / performance bonus.

## Fix (only `src/components/DispatcherSalaryChart.tsx`)

1. Pull the same inputs the list uses:
   - `profiles.office` (already fetched via `dispatcher_salary_payments` history / profiles) — add `office` to the existing `profiles` query so we can apply the $70 CACAK/KRAGUJEVAC food allowance rule (memory: `mem://features/payroll/food-allowance`).
   - `dispatcher_off_duty_days` (lost days per user per date) and the extra‑days source used by Dispatcher Salaries (same tables the list reads), so we can add extra‑day pay and subtract lost‑day deduction per month.
   - Continue to use `dispatcher_monthly_bonuses` (already loaded) and `dispatcher_salary_payments.additionals` (already loaded).

2. Rework the per‑month salary formula for one dispatcher / one month to mirror the list exactly:
   ```
   base       = freight * gross% + max(0, freight - driverPay) * cut%
   perDay     = base / workDaysInMonth(month)
   extraPay   = extraDayCount(month) * perDay
   lostDed    = lostDayCount(month) * perDay
   food       = hasFoodOffice(office) ? 70 : 0
   adjustments= additions - charges - appliedPenalties (percent = % of base)
   salary     = base + food + extraPay - lostDed + monthlyBonus + adjustments
   ```
   Freight/driverPay basis stays as `totalFreightAmountNoLumper` / `totalDriverPay` (already fixed). Canceled+TONU handling: match the list — do NOT add canceled‑order TONU into the salary base (this removes the residual ~$11 drift).

3. Apply that formula in three places inside the chart file:
   - `salaryByMonth` / `countByMonth` (aggregate Avg Dispatcher Salary line).
   - `perDispatcherSalary` (per‑dispatcher lines drawn when dispatchers are selected).
   - `dispatcherAverages` table below the chart.

4. Averages table meaning — one small clarification needed:
   - Today the "Avg Salary" column is `sum(monthly salary) / monthCount` across the selected period. Because Nov 2025 was ~$1.7k for Jerry, the average is ~$2.6k even when June alone is ~$4.9k.
   - Option A: keep it as the true period average of monthly salaries (what "avg" normally means), but recomputed with the full formula above so it stays consistent with what the chart line plots.
   - Option B: show the salary of a specific month (e.g. the last selected month) so the table matches the Dispatcher Salaries list for that month.

## Question for you
For the "Dispatcher averages" table under the chart, do you want:

- (A) Average of monthly salaries across the selected period (matches the chart line, will differ from a single month on the Dispatcher Salaries list), or
- (B) Show the value for a single month (e.g. the most recent selected month), so a row matches the Dispatcher Salaries list exactly?

Chart tooltip will match the Dispatcher Salaries list for that month in both options.