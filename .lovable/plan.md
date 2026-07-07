## Plan

Reuse the same data the Dispatcher Salaries table already loads in `Analytics.tsx`. The chart should not run its own Supabase queries, so it stops re-fetching and re-deriving the same data — which is the real source of the freezes.

### What changes

1. **Remove all Supabase fetching from `DispatcherSalaryChart`**
   - Delete the 5 internal `useQuery` calls (profiles, afterhours_schedule, off-duty-days, monthly bonuses, salary payments additionals).
   - The component becomes a pure presentation + memoization component.

2. **Pass shared data in as props from `Analytics.tsx`**
   - `Analytics.tsx` already loads: `dispatcherProfiles` (with `gross_percent`, `cut_percent`, `office`, `created_at`), `salaryPayments` (with `additionals`), monthly bonuses, `afterhours_schedule` entries, `dispatcher_off_duty_days`, and the orders array.
   - Build small memoized maps in `Analytics.tsx` once (rates by user id / name, food-office flag, extra-days per user+month, lost-days per user+month, bonuses per user+month, additionals per user+month) and pass them into `DispatcherSalaryChart` as props.
   - Use `React.memo` on `DispatcherSalaryChart` and pass stable prop references so chart hover / dispatcher toggles do not force parent recomputation.

3. **Restore the chart UI**
   - Bring back the Recharts `Tooltip`, visible dots, and active dots.
   - Remove the temporary `pointer-events-none` guard.

4. **Keep the salary precompute cache**
   - Keep the good part of the previous change: salaries per dispatcher/month are computed once from the injected maps and reused by the chart, the per-dispatcher lines, and the averages table.
   - Selecting / deselecting dispatchers only filters the cache; it does not recompute salaries.

5. **Lower priority selection updates**
   - Wrap the dispatcher checkbox toggle in `startTransition` so mouse clicks stay responsive even while lines rebuild.

6. **Validate**
   - Run TypeScript check.
   - Confirm no duplicate network requests for the chart (only Dispatcher Salaries requests remain).
   - Confirm the chart values still match the Dispatcher Salaries table.

### Technical detail

- New `DispatcherSalaryChart` props:
  - `orders`
  - `ratesByUserId`, `ratesByName`, `nameToUserId`, `userIdToName`, `officeByUserId`, `officeByName`
  - `extraDaysByUserMonth`, `lostDaysByUserMonth`
  - `bonusesByUserMonth`
  - `additionalsByUserMonth`
- All of these are derived in `Analytics.tsx` from state already populated by the Dispatcher Salaries tab.
- The chart no longer imports `supabase` or `useQuery`.

```text
Analytics.tsx (already fetching)
  ├── dispatcherProfiles ──▶ rates + office maps ─┐
  ├── salaryPayments      ──▶ additionals map    ─┤
  ├── monthlyBonuses       ──▶ bonuses map       ─┼──▶ <DispatcherSalaryChart {...maps} orders={orders} />
  ├── afterhoursSchedule   ──▶ extraDays map     ─┤
  └── offDutyDays          ──▶ lostDays map      ─┘
```