## What's happening

Anastasija Jankovic-Stacy is filtered out of every Billboard ranking because her **average truck count resolves to 0**, and the boards only show dispatchers with **≥ 4.8 avg trucks**. Her RPM ($3.72) would otherwise be #1.

Verified in the database:

- She has 7 active drivers and is role `dispatch` (not a manager), so the manager exclusion isn't the cause.
- On **Jul 20** all 7 of her drivers were reassigned to other dispatchers (Iris, Bran, Pablo, Devin, James, Dexter), and on **Jul 27 11:39** they were all reassigned back to her.
- Consequently `dispatcher_daily_driver_counts` has rows for her only through **Jul 19** — nothing for Jul 20–26.
- Billboard's truck-count lookup: current week (Mon Jul 27 – Aug 2) has no snapshot rows yet for anyone (the nightly job last wrote Jul 26), so it falls back to "latest date minus 6 days" = **Jul 20–26** — exactly the window where she has no rows. Result: `avgTrucks = 0` → filtered out.
- The monthly RPM board (July 2026) reuses this same weekly truck-count number, which is why she's missing there too, even though Analytics computes 7.0 avg trucks for July.

## The fix

**1. Monthly boards use monthly truck counts**

Add a separate fetch of `dispatcher_daily_driver_counts` over the current month (`monthStart`–`monthEnd`) and use that average for `monthlyDispatcherStats.avgTrucks`. This matches what Analytics shows for July and makes the monthly board independent of a single week's snapshot gaps. Stacy averages 7 over July, so she qualifies.

**2. Weekly boards fall back to live counts**

When a dispatcher appears in the week's orders but has no snapshot rows in the chosen window, fall back to their **current** live truck count (distinct trucks whose driver1/driver2 is an active driver assigned to them) instead of defaulting to 0. This covers the daily gap between midnight and the nightly snapshot run, and dispatchers coming back from a reassignment period.

**3. Keep thresholds and other rules unchanged**

The 4.8 minimum, manager exclusion, recovery-driver exclusion, RPM formula, and rotation order all stay as they are — this is only about how `avgTrucks` is resolved.

## Technical details

- File: `src/pages/Billboard.tsx`
  - New `useEffect` fetching month-range rows into `dispatcherMonthlyTruckCounts`; `monthlyDispatcherStats` reads from it.
  - New lightweight query (drivers + trucks, same shape the nightly job uses) to build `liveTruckCounts`, used as fallback in `dispatcherStats` when snapshot avg is 0/undefined.
- No database migration, no edge-function change, no change to the nightly snapshot job.

## Note (separate, optional)

The nightly `record-dispatcher-driver-counts` function only records dispatchers who currently have drivers, so any dispatcher with a temporary zero-driver stretch simply has no rows for those days — that's expected behavior and doesn't need changing for this fix.
