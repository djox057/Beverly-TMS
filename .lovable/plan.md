## Why Analytics is slow today

`src/pages/Analytics.tsx` (5,296 lines) loads via `useOrdersWithProgress`, which:

1. Calls `get-all-unlocked-orders` once (every unlocked order in one payload).
2. Loops `get-all-locked-orders` in 1,000-row batches, up to 200 batches → potentially **200 round-trips** for locked history.
3. Merges, dedupes, sorts, runs `transformOrders` on the full set.
4. The page then runs ~25 `useMemo` aggregations (`dispatcherAnalytics`, `driverAnalytics`, `totals`, `fleetAverages`, `driverGrossRankings`, `qualifyingLoads`, `coveragePercent`, etc.) over every order in the browser.

The bottleneck is the network round-trips + payload size + JS reductions over the entire orders table — not Postgres itself.

## Yes — apply the lane-search pattern

New edge function `analytics-summary` runs the entire pipeline server-side and returns only the numbers the page renders.

```text
Browser ──POST──► analytics-summary ──► Postgres aggregations
        ◄─────── { dispatcherStats[], driverStats[],
                   totals, fleetAverages, qualifyingLoads,
                   weeklyHighRate, weeklyHighCut, rankings,
                   coveragePercent, activeDriverNames }
```

Inside the function:

- One SQL pass per metric group, using `GROUP BY` on `orders` joined to `drivers` / `profiles`, filtered by `pickup_datetime` / `delivery_datetime` window, `canceled = false`, optional `booked_by`, optional `dispatcher_id`.
- All filtering and sorting in Postgres — return ready-to-render arrays.
- Role enforcement (`isDispatchOnly`, dispatcher-only seeing own data, hidden bonuses for `dispatch`) decided from the JWT inside the function, never trusted from the body.
- For per-order tabs ("Loads", "qualifying loads", high-rate, 50%-cut), return only the small filtered rows the UI shows — not the whole orders table.

## Frontend changes

- New hook `useAnalyticsSummary({ dateRange, bookedBy, dispatcherUserId })` — single `supabase.functions.invoke("analytics-summary", …)` wrapped in React Query, `staleTime: 5 min`.
- `Analytics.tsx` reads fields straight off `summary.*`; the 25 `useMemo` reducers go away.
- Loading-progress UI ("X / Y locked") becomes a single skeleton/spinner.
- `useOrdersRealtime` subscription stays, but now debounce-invalidates the `analytics-summary` query instead of patching an in-memory order list.

## Expected gains

- One HTTP request instead of 1 unlocked + up to ~200 locked batches.
- Response shrinks from megabytes of order JSON to tens of KB of aggregates.
- All in-browser reductions disappear — first paint becomes near-instant after the response.
- Realistic 5–15× faster initial load, matching the lane-search win.

## Risks / things to nail down before building

1. **Coverage of every tab.** Need to enumerate every metric/column the current page reads from `orders` so the edge function returns all of them. Riskiest surfaces: the "Loads" tab, dispatcher detail popovers, driver detail popovers (per-order rows). Either paginate those server-side or keep a raw fetch only when the popover opens.
2. **Salaries tab + payroll dialogs** still write back to `dispatcher_salary_payments` etc. — those mutations stay client-side, only the read aggregates move.
3. **Date-window edge cases.** Chicago-time boundaries must be applied in the SQL window (use `AT TIME ZONE 'America/Chicago'`), not naïve UTC.
4. **Realtime correctness.** Need a debounce so a burst of order edits doesn't refetch the summary 50× per minute.

## Suggested rollout

1. Build `analytics-summary` covering the top-of-page totals + dispatcher table only (highest-traffic surface). Behind a flag `localStorage.analytics_v2 = "true"`.
2. Verify numbers match current page across several date ranges and roles.
3. Migrate Driver Analytics, Rankings, Salaries, and Loads tabs one at a time.
4. Flip the flag default to on; remove `useOrdersWithProgress` from `Analytics.tsx`.

## Smaller wins we can ship first if you want a faster step

- Narrow the `select(...)` lists in `get-all-unlocked-orders` / `get-all-locked-orders` to only columns Analytics actually reads (smaller payload, faster JSON parse).
- Run `transformOrders` per batch as it arrives instead of once on the merged array.
- Increase locked batch size from 1,000 → 5,000 to cut round-trips ~5×.

These are reversible and give noticeable improvement without the full rewrite.

---

Want me to start with the small wins, or go straight to the `analytics-summary` edge function (recommended for the 5–15× target)?
