## Plan

1. **Make “Canceled Loads” a real server-side filter**
   - Add the selected status filter to the filters sent from `/orders` to the `search-orders` and `orders-summary` edge functions.
   - For `Canceled Loads`, apply `orders.canceled = true` on the server so the result count is the true full count for the selected pickup date range.

2. **Fix the totals badges above All Loads**
   - Make the total/unlocked/locked badges use the server summary for the selected status + date period, not the current visible page.
   - This should show `179 total` for pickup date `Jul 6–12, 2026` + `Canceled Loads`, and `182 total` for `Jun 29–Jul 5, 2026` + `Canceled Loads`.

3. **Fix Export to Excel**
   - Change export so filtered exports fetch all matching rows from the server in batches before creating the Excel file.
   - Export should no longer use only currently loaded/visible rows, so it should export all 179 / 182 canceled loads for those date periods.

4. **Keep selection behavior unchanged**
   - If the user manually selects specific rows, selected-row actions stay based on selected rows.
   - Normal “Export to Excel” exports the full current filter result set when filters are active.

5. **Validate**
   - Verify the canceled pickup-date filters return the expected totals:
     - `Jul 6–12, 2026`: 179
     - `Jun 29–Jul 5, 2026`: 182
   - Verify the exported Excel row count matches the displayed total.