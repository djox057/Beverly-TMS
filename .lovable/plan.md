
## Extend all-time load count rule to "New drivers" filter

### Change

Update the **"New drivers" filter button** in Reports to use the same all-time load count logic as the drug-test UI, instead of its current window-based check.

### Behavior

A driver is shown by the "New drivers" filter only when they have **fewer than 2 loads in their entire history** (across all dates, excluding `GAME|OVER` placeholders).

This makes both the filter button and the drug-test cell highlight consistent: a driver like Leonard Smith — who has only 1 load in the visible window but many lifetime loads — will no longer appear under "New drivers" and will not show drug-test UI.

### Files touched

| File | Change |
|------|--------|
| `src/hooks/useDriverAllTimeLoadCounts.ts` | **New** (from prior approved plan). React-Query hook returning `Map<driverId, count>` from `orders` (excluding `GAME|OVER`). |
| `src/pages/Reports.tsx` | Replace `isNewDriver(truck)` call inside the "New drivers" filter codepath (~line 3092) with `truck.driverId && getLoadCount(truck.driverId) < 2`. Also apply the same gate to drug-test cell styling and click target. |

### Not changing

- The `isNewDriver` helper itself stays in place for any other internal use.
- Empty-trucks filter, late-trucks filter, two-week-notice filter — untouched.
- Backend, RLS, migrations — none required (uses existing `orders` SELECT policy).

### Verification

1. Leonard Smith (1 load in window, many lifetime) → does **not** appear under "New drivers" filter; no drug-test tint on his row.
2. A truly new hire (0 or 1 lifetime load) → appears under "New drivers" filter; drug-test cell tint and click work.
3. Other filters behave exactly as before.
