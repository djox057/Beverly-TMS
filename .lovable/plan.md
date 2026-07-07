Plan to fix the dispatcher salary chart lag/freezes:

1. Precompute salary rows once
   - Build one cached `dispatcherMonthRows` index from the already-loaded orders and payroll inputs.
   - Each row will store dispatcher key/name, month, freight, miles, salary, projected salary, RPM, and count eligibility.
   - Include the same food allowance logic in this precompute so we do not recalculate it during every click.

2. Make chart clicks cheap
   - Change dispatcher select/deselect to only filter the precomputed rows instead of rerunning `computeSalary` across dispatchers/months.
   - Keep time filters using the same precomputed month rows, since those are already instant.

3. Reduce Recharts render pressure
   - Use stable, short series keys for selected dispatchers instead of raw dispatcher IDs in chart data keys.
   - Avoid rebuilding the full aggregate chart/table when only a selected dispatcher line changes.
   - Keep chart animations off.

4. Keep the averages table filtered
   - `Dispatcher averages — {period}` will continue showing only the active time filter.
   - If dispatchers are selected, it will show only selected dispatchers.
   - Columns remain: dispatcher name, RPM, average salary.

5. Validate
   - Verify selecting and deselecting dispatchers no longer freezes after the salaries tab is loaded.
   - Verify the chart/table salary values still include food allowance and stay aligned with Dispatcher Salaries.