
# Fix: Reports page not loading orders for non-primary offices

## Root Cause

In `useReportsDateWindow.ts`, two mechanisms prevent orders from loading when switching offices:

1. **`globalLoadedWindows` is not office-scoped** (line 560, 692): This module-level `Set` tracks loaded date ranges using only the date key (e.g., `"2026-02-04_2026-02-09"`). When Office A loads today's window, it marks this key as loaded. When switching to Office B, the same key is already in the set, so the fetch is **skipped entirely** -- Office B's drivers' orders are never fetched.

2. **Orders query key missing office scope** (line 680): The React Query key `['reports-date-window-orders', windowKey, 'all']` does not include the office name. So React Query serves the cached (skipped) result from Office A when Office B requests the same date window.

**Why it works after navigating +1 day and back:** The date window key changes (different dates), bypassing both caches, which triggers a fresh fetch using the now-correct `driverIdsRef` (populated by the stable query which IS office-scoped).

**Why the user's own office works:** It's the first office loaded, so the `globalLoadedWindows` set is empty and the fetch proceeds normally.

## Fix

Two changes in `src/hooks/useReportsDateWindow.ts`:

### Change 1: Scope `globalLoadedWindows` entries by office context

Instead of storing just `windowKey` (date range), store `scopedWindowKey` that includes the office/mode context:

```typescript
// Line 692 area - before:
if (globalLoadedWindows.has(windowKey)) { ... }

// After:
const scopedWindowKey = `${priorityOffice || 'all'}_${individualMode ? currentUserDispatcherId : 'all'}_${windowKey}`;
if (globalLoadedWindows.has(scopedWindowKey)) { ... }
```

### Change 2: Include office in the orders query key

```typescript
// Line 680 - before:
queryKey: ['reports-date-window-orders', windowKey, individualMode ? 'individual' : 'all']

// After:
queryKey: ['reports-date-window-orders', windowKey, priorityOffice || 'all-offices', individualMode ? 'individual' : 'all', individualMode ? currentUserDispatcherId : 'all']
```

### Change 3: Update all references to windowKey in globalLoadedWindows

The same scoped key must be used consistently at:
- Line 692 (skip check in queryFn)
- Line 737 (marking window as loaded after fetch)
- Line 762 (initial fetch trigger effect)
- Line 771-773 (reset trigger flag effect)
- Lines 802, 809 (prefetch adjacent windows)

## Technical Details

### File: `src/hooks/useReportsDateWindow.ts`

The `scopedWindowKey` will be computed in the hook body and used everywhere `windowKey` currently appears in relation to `globalLoadedWindows`. The `windowKey` itself stays unchanged for its original purpose (identifying date ranges). A new variable `scopedWindowKey` combines office + mode + dates.

No other files need changes. The adapter and UI components consume `accumulatedOrders` which will now correctly contain orders from all offices as each office's window is loaded independently.
