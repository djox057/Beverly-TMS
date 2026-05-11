# Faster cross-office load# search in Reports

## The problem

When you search a load number in Reports and the load belongs to a different office tab:

1. `useAutoSwitchOffice` does a DB lookup → finds the office → calls `setActiveTab(newOffice)`.
2. `activeTab` is wired into `useReports` as `priorityOffice` (Reports.tsx line 471).
3. The priority query re-runs and loads the **entire** new office: every dispatcher, every truck, every driver, all unlocked + locked orders for that office (90 days), notes, lost-day notes, etc.
4. Only after that finishes does the searched load's row appear.

When the load is already in the open tab, no refetch is needed → results are instant. We want the cross-office case to feel just as fast.

## The fix — "spotlight driver" path

Render the single matched driver row immediately using a tiny targeted fetch, then swap it in as the full office finishes loading in the background.

### Flow

```text
User types load# (e.g., 12345)
        │
        ▼
useAutoSwitchOffice.lookupLoadOffice()
  - finds order(s), driver1_id, dispatcher.office
  - returns { office, driver1_id, orderIds }
        │
        ├──► setSpotlightDriverId(driver1_id)   ← NEW, fires immediately
        │       └──► useReportsSpotlightDriver()  fetches ONLY:
        │              • that driver + their truck/trailer/company
        │              • the matching order(s) + pickup_drops + transfers
        │              • that driver's recent notes / lost-day notes
        │            → injected into groupedReports as a synthetic
        │              one-row group at the top, visible in <1s.
        │
        └──► setActiveTab(office)
                └──► priorityQuery starts loading the rest of the
                     office in the background (existing behavior).
                     When it returns, spotlight row is reconciled
                     with the full data and the synthetic group
                     is dropped.
```

### Rendering rules

- The spotlight row is shown only while:
  - load# search is active, AND
  - the spotlight driver does **not** yet exist in `groupedReports`.
- Once the priority query for the new office returns and includes that driver, drop the spotlight (full data wins).
- If the user clears or changes the search, clear the spotlight immediately.
- If the matched driver is already in the currently loaded data, skip the spotlight entirely (current fast path).

### Edge cases

- **Ambiguous match** (multiple offices): no spotlight; behave as today.
- **Locked / canceled orders**: spotlight still shows; reuse the existing locked/canceled badges from `foundOrderMeta`.
- **Multiple driver1_ids** for the same load# prefix: spotlight the first match only; the others appear when the office finishes loading.
- **Tab manually switched away**: clear spotlight (don't strand a row from another office).

## Files to change

1. **`src/hooks/useAutoSwitchOffice.ts`**
   - Extend `lookupLoadOffice` to also return `driver1_id` and `orderIds` for the best match.
   - Expose new state from the hook: `spotlightDriverId`, `spotlightOrderIds` (cleared when load filter clears or the driver appears in `groupedReports`).

2. **`src/hooks/useReportsSpotlightDriver.ts`** (new)
   - Tiny `useQuery` keyed by `["reports", "spotlight", driverId]`.
   - Fetches: driver row, their truck (+ trailer, company), the specific order(s) by id with `pickup_drops` + `order_transfers`, that driver's recent truck notes / lost-day notes / problems (same shape used by the main grid).
   - Returns a single synthesized group object matching the structure produced by `fetchReportsData` so it can be merged into `groupedReports` with no renderer changes.

3. **`src/hooks/useReportsDateWindowAdapter.ts`** (or wherever `groupedReports` is finalized for Reports.tsx)
   - Accept an optional `spotlightGroup` and prepend/merge it into the returned data when the spotlight driver isn't already present.
   - Reconcile (drop spotlight) once the real group containing that driver is loaded.

4. **`src/pages/Reports.tsx`**
   - Wire `spotlightDriverId` from `useAutoSwitchOffice` → `useReportsSpotlightDriver` → adapter merge.
   - No UI changes beyond rendering the existing row component for the spotlight group.

## Out of scope

- No changes to the autoswitch heuristics for truck/driver-name search (already fast — they don't need a spotlight).
- No changes to background office loading, RLS, or the date-window logic.
- No UI redesign; the spotlight uses the same row component as a normal driver group.

## Success criteria

- Searching a load# whose driver is in a different office shows that driver's row in roughly the same time as searching a load# in the current tab (sub-second after the DB lookup).
- The full office tab continues to fill in behind it without flicker, and the spotlight row is replaced seamlessly.
