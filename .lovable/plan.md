## Problem

New orders inserted in the DB don't appear on Reports until a full refresh.

Root cause: Reports doesn't use the `["reports"]` query family anymore — it reads from a **module-level store** in `src/hooks/useReportsDateWindow.ts`:

- `globalAccumulatedOrders: Map<orderId, order>` — what the UI actually renders
- `globalLoadedWindows: Set<scopedWindowKey>` — short-circuits the date-window queryFn (returns `{skipped: true}` if the window is already marked loaded)
- Query keys are `reports-date-window-orders` / `reports-date-window-stable`, not `["reports"]`

The current `useReportsRealtime` only invalidates `["reports"]`. Even if we invalidated the date-window keys, the queryFn would still early-return because `globalLoadedWindows` says the window is loaded, and accumulated orders would never receive the new row.

## Fix

Wire realtime directly into the module-level store via the existing `injectOrdersIntoGlobalStore` + a new sibling for deletes.

### 1. `src/hooks/useReportsDateWindow.ts`
- Export a new helper `removeOrdersFromGlobalStore(ids: string[])` that deletes entries from `globalAccumulatedOrders`, bumps `globalOrdersVersion`, and notifies `versionListeners` (mirrors `injectOrdersIntoGlobalStore`).
- Optional: also export a small `invalidateLoadedWindow(scopedWindowKey?)` that removes entries from `globalLoadedWindows` so the next mount/date-nav refetches cleanly. Not strictly required for the user-visible fix because realtime already merges the changed row.

### 2. `src/hooks/useReportsRealtime.ts` — replace the "invalidate everything" body with a targeted merger
- Subscribe to `orders`, `pickup_drops`, `order_transfers` (already does).
- Coalesce changes with the same 1s debounce already in place, into two sets: `changedOrderIds`, `deletedOrderIds` (for pickup_drops / order_transfers, resolve `order_id` from payload).
- On flush:
  - For deletes: call `removeOrdersFromGlobalStore([...deletedOrderIds])`.
  - For changes: fetch the affected orders using the **same shape Reports expects**. Reuse `fetchOrdersForDateWindow` / `fetchLockedOrdersForDateWindow` is overkill — use the existing batch-fetch utility `src/utils/ordersFlatBatchFetch.ts` (already used by `useOrdersRealtime`) so the row shape matches the rest of the app, then run it through `transformOrders` from `src/utils/ordersTransform.ts`. Pass the result to `injectOrdersIntoGlobalStore`.
  - Also keep the existing `queryClient.invalidateQueries({ queryKey: ["reports"], exact: false })` call so any legacy consumers (mutations in `useReports.ts`) still refresh.
- Keep the subscription mounted once at the App level (already done in `src/App.tsx`).

### 3. Verification
- Insert a new order via the existing flow → it appears on Reports within ~1s without navigating.
- Update an existing order's pickup/delivery → row updates in place.
- Delete an order → row disappears.
- Date carousel navigation still works (we never clear `globalLoadedWindows` on realtime, so windows stay marked loaded; the merged row will already be in the accumulated store, so it renders on whichever date window matches it).

### Out of scope
- No schema changes.
- No changes to `useReports.ts` mutation flows (they already update via React Query optimistic updates).
- No change to the Reports page rendering logic.

### Files touched
- `src/hooks/useReportsDateWindow.ts` — add `removeOrdersFromGlobalStore` export.
- `src/hooks/useReportsRealtime.ts` — replace body with the targeted merger described above.
