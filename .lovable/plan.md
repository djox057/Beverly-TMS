## Goal

When the user searches by Load # and the matched order's pickup date is outside the currently visible 6-day calendar carousel, automatically scroll each affected dispatcher's carousel so the matched load is visible.

## Current behavior

- `Reports.tsx` already updates the **data window** (`selectedDateForWindow`) to fetch orders around the found load (lines 551–562), so data is loaded.
- However, each dispatcher group has its own carousel position stored in `calendarDates[dispatcherId]` (default = today − 2). That position is **not** moved when a load is found, so the user still sees the current week and has to click the chevron to find the older load.

## Change

In `src/pages/Reports.tsx`, extend the existing `useEffect` that watches `foundOrderMeta?.pickupDate` (around line 551) so that, in addition to updating `selectedDateForWindow`, it also repositions the per-dispatcher carousels:

1. Compute `targetStart = pickupDate − 2 days` (same formula as the default carousel start).
2. Only act when a load filter is active (`debouncedLoadNumberFilter.trim().length >= 3`) and `pickupDate` is outside the current 6-day carousel window for that dispatcher.
3. For every dispatcher group in `groupedReports` whose trucks contain an order matched by `orderMatchesLoadFilter(order, debouncedLoadNumberFilter)`, set `calendarDates[dispatcherId] = targetStart` via `setCalendarDates`.
4. Also call `loadDispatcherOrders(dispatcherId, targetStart)` and `loadDispatcherOrders(dispatcherId, addDays(targetStart, 5))` to lazy-load any orders for that dispatcher in the new window (mirrors `handleCalendarDateChange`).
5. Expand `lost_day_notes` window via the existing `ensureLostDayNotesForDateRange` helper for the new range, same as `handleCalendarDateChange`.

Effect dependencies: `[foundOrderMeta?.pickupDate, debouncedLoadNumberFilter, groupedReports]`. Guard against repeatedly resetting the position once it's already at `targetStart` (compare with current `calendarDates[dispatcherId]`).

## Out of scope

- No change when filter is cleared — leave each dispatcher's carousel where it is so the user doesn't lose context.
- No change to non-load filters (truck/driver/dispatch).
- No changes to data-loading logic; reuses the existing `loadDispatcherOrders` and `ensureLostDayNotesForDateRange` helpers.
- No business-logic changes, no styling changes.

## Files touched

- `src/pages/Reports.tsx` — extend the existing `foundOrderMeta` effect (~line 551).
