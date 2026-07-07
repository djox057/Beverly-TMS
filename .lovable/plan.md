## Plan

1. **Stop heavy Recharts hover work**
   - Disable chart mouse/tooltip interaction for dispatcher-line mode, or replace the live Recharts tooltip with a lightweight click-only tooltip so moving the mouse across the chart no longer causes constant rerenders.
   - Keep chart values visible through the averages/list table so no salary information is lost.

2. **Make dispatcher selection/deselection cheap**
   - Precompute salary rows once per loaded dataset, then filter the already-computed rows when dispatchers/months change.
   - Avoid recalculating every dispatcher/month salary when only selecting or clearing dispatchers.

3. **Reduce rendered chart elements**
   - Remove/limit dots on dispatcher lines and keep animations off.
   - Cap or simplify per-dispatcher chart rendering when multiple dispatchers are selected, so Recharts does not create excessive SVG nodes.

4. **Keep the filtered list behavior**
   - The “Dispatcher averages” list remains filtered by selected dispatchers and active period.
   - Salary calculation keeps food allowance and the same payroll formula already aligned with Dispatcher Salaries.

5. **Validate**
   - Run a focused typecheck and, if possible, use the preview to test selecting/deselecting dispatchers and moving the mouse across the chart without freezes.