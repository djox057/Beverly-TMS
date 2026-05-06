## Goal

In the weekend auto-assign, the two BG offices (`BG 1st floor` and `BG 4th floor`) are currently treated as separate offices, so weekend dispatchers from one floor never receive drivers whose weekday dispatcher is on the other floor. Result: only `BG 1st floor` weekend dispatchers get drivers (or vice versa). Unify both floors into a single logical "BG" pool for distribution, while:

- Keeping each driver's underlying `office` value untouched in the database.
- Prioritizing keeping a weekday dispatcher's full set of trucks under ONE weekend dispatcher (no splitting across two weekend dispatchers when avoidable).

## Changes

### 1. Edge function: `supabase/functions/auto-assign-weekend-drivers/index.ts`

- Add a `groupKey(office)` helper that maps both `BG 1st floor` and `BG 4th floor` to a single key `"BG"`; everything else returns the office unchanged.
- Use `groupKey(...)` everywhere drivers/dispatchers are bucketed:
  - When building `driversByOffice` from enriched drivers.
  - When building `weekendByOffice` from scheduled afterhours users.
- Update the per-day distribution loop so a single "BG" bucket combines weekend dispatchers from both floors and all BG-floor drivers.
- Replace the current second-pass greedy bin-packing with a **whole-group placement** strategy that prioritizes keeping a weekday dispatcher's drivers together:

  ```text
  Pass 1: each weekend dispatcher takes their OWN weekday drivers (capped at base+extra share).
  Pass 2: process remaining weekday-dispatcher groups largest-first.
          For each group, place the WHOLE group into the weekend dispatcher
          with the most remaining capacity (no splitting), even if it slightly
          exceeds the base share. Only split a group when no weekend dispatcher
          can fit it without going more than 1 driver above the largest
          current load (load-balance guard).
  ```

  This keeps "all of dispatcher X's trucks under one weekend dispatcher" whenever feasible, and only splits when the remaining group is larger than any single weekend dispatcher can absorb without serious imbalance.

### 2. Client hook: `src/hooks/useAfterhoursAssignments.ts`

Mirror the same two changes inside `autoAssignDrivers()` so the manual "Auto-assign" button in the UI behaves identically to the scheduled cron job:

- Same `groupKey()` helper unifying the two BG floors.
- Same "place whole group, then split only when necessary" second-pass logic.

### 3. No changes to

- `AssignAfterhoursDriversDialog.tsx` (manual add) — it groups for display only and the user already sees both BG floors as separate office headers, which is correct.
- Database schema / `office` enum.
- Other pages that read `office` (Analytics, Reports, Fleets) — they still treat the floors separately, which is desired everywhere except auto-assign.

## Technical detail

```ts
const BG_OFFICES = new Set(["BG 1st floor", "BG 4th floor"]);
const groupKey = (office: string | null | undefined) =>
  office && BG_OFFICES.has(office) ? "BG" : (office || "Unknown");
```

Used to bucket `driversByOffice` and `weekendByOffice`. Driver/user records keep their original `office` field; only the bucketing key changes.

## Verification

After deploy, run the edge function with `?force=1` for an upcoming weekend and confirm:
- Weekend dispatchers from BOTH BG floors receive drivers from BOTH BG floors.
- Each weekday dispatcher's drivers stay under a single weekend dispatcher unless the group is too large to fit without imbalance.
- Non-BG offices (KRAGUJEVAC, Čačak, Recovery) are unaffected.