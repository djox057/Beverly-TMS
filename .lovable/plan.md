Plan:

1. Fix the debounced save race in `RecruitingTab.tsx`.
   - Right now the delayed save reads `rowsRef.current[userId]` when the timer fires.
   - If you change June and switch to July within the debounce window, that timer can save the July row instead of the June row, so June never becomes the prior base salary for July.

2. Make salary saves month-specific.
   - Key pending save timers by `userId + month` instead of only `userId`.
   - Capture the updated row snapshot when scheduling the save, so a June edit always saves June even after navigating to July.

3. Keep base salary propagation tied to the edited month.
   - Track pending base salary propagation by `userId + month`, so changing June propagates from June forward, not from whatever month is currently open when the save runs.

4. Invalidate the relevant React Query caches after the save/propagation.
   - Refresh the edited month payments.
   - Refresh all `recruiter-prior-base-salaries` queries so July immediately inherits the newly saved June value.

5. Preserve the existing business rule.
   - Current month, previous month, and future month edits propagate forward.
   - Edits from 2+ months in the past do not change future salaries.