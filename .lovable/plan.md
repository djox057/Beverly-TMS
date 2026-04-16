
Fix the force-complete feature by updating the Reports source of truth, not just the popup state.

1. Confirm the bug source
- I checked the database for broker load `567154`: `pod_force_complete` is already `true`.
- That means the save works, but Reports is still rendering stale/incomplete order state.

2. Update Reports cache optimistically after force-complete
- In `src/pages/Reports.tsx`, extend `handleForceComplete` so it updates the nested `["reports", "priority", ...]` and `["reports", "full"]` query data, not only `zoomedLoad`.
- Update the matching order inside `truck.allOrders` with:
  - `pod_force_complete` / `bol_force_complete = true`
  - camelCase mirror fields too (`podForceComplete` / `bolForceComplete`)
  - POD case: status `delivered`
  - delivery stops `checked_out_at` locally after success
- This will make the popup reopen correctly and make the pickup/drop cells change immediately.

3. Make popup reopening read both field shapes
- In `getLoadDetailsForZoom`, derive the flags from both snake_case and camelCase:
  - `order.pod_force_complete || order.podForceComplete`
  - `order.bol_force_complete || order.bolForceComplete`
- This prevents the button from reappearing when the cached order uses the transformed shape.

4. Apply force-complete to Reports rendering logic everywhere
- In `src/hooks/useReports.ts`, include force-complete flags in derived status:
  - `hasPOD` should treat `pod_force_complete` as POD complete
  - `hasBOL` should treat `bol_force_complete` as BOL complete
- Update:
  - `getDocumentStatus`
  - `documentColors`
  - `isActive` / `isRecentCompleted`
  - any load-detail document summaries built from `order_files` only
- This ensures force-completed loads behave like completed loads across the whole Reports page, not just cell color helpers.

5. Keep button visibility strictly rule-based
- In the load info dialog, keep the button visible only when:
  - BOL: `pickupStops.length > bolCount` and force flag is false
  - POD: `deliveryStops.length > podCount` and force flag is false
- Use the normalized flag value so the button disappears reliably after completion.

6. Verify the exact reported case
- Re-test broker load `567154` after the changes:
  - close/reopen load info: POD Complete button must stay hidden
  - all delivery drops for that load must render as complete
  - delivered/complete-derived UI should reflect the override consistently

Technical notes
- Root cause is not the database write; it is stale Reports state plus incomplete use of `pod_force_complete` / `bol_force_complete` in derived UI logic.
- Main files to update:
  - `src/pages/Reports.tsx`
  - `src/hooks/useReports.ts`
- No database migration is needed for this fix.
