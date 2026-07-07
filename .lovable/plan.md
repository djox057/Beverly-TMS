## Change

In `src/components/DispatcherSalaryChart.tsx`, change the dispatcher count shown on the **projected current-month** tooltip point so it counts every dispatcher who has at least one order booked in the current month, regardless of projected salary size.

## Details

- Today the projected point uses `projectedCountCurrentMonth` = number of dispatchers whose *projected* salary ≥ $500 (display threshold).
- New behavior: count = number of distinct `booked_by` dispatchers who appear in `perDispatcherByMonth[currentMonthKey]` with any freight activity this month (i.e. any non-canceled July order, matching the existing aggregation rules).
- Only the **count** on the projected point changes. The projected average salary still uses the existing >$700 hidden threshold, and historical months are untouched.
- Tooltip label stays "Jul 2026 — N dispatchers".

## Files

- `src/components/DispatcherSalaryChart.tsx` — replace the projected count derivation with `Object.keys(perDispatcherByMonth[currentMonthKey] ?? {}).length`.