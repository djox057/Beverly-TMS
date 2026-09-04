# Cut realtime messages drastically — root cause found in the Aug 31 changes

## What went wrong on August 31

You are right about the date. While adding the OOS (out of service) checkbox that afternoon, the truck list was switched on for live updates so the checkbox would flip for everyone instantly:

- 17:24 — a live-update watcher was added on the truck list and mounted on both Reports and Trucks.
- 17:32 — a migration put the whole **truck list** into the live-update feed.

That one line is the bill. The truck list is the single busiest table in the system: background jobs (fuel, mileage/ETA, Samsara locations) rewrite all ~490 trucks every few minutes. Confirmed against the database: the truck list has ~31.4 million row updates recorded lifetime, versus ~260,000 for orders and ~305,000 for stops. Every one of those truck rewrites is delivered once per open listener, and every signed-in person keeps several truck listeners open — so a single background job pass turns into tens of thousands of billed messages.

Everything since then (moving fuel and miles into a silent table, the Samsara "only write real changes" fix) reduced the *writes*, but the truck list is still in the live feed, so any remaining truck write still fans out to everyone.

Also verified now: row changes on the live-enabled tables are currently tiny (last hour: 12 orders, 12 stops, 15 daily-report rows, 0 trucks), so the remaining cost is fan-out and re-joins, not database activity.

## Plan

### 1. Take the truck list out of the live feed (the actual fix)
Remove `trucks` from the live-update publication — undoing the Aug 31 migration.

### 2. Keep the OOS checkbox instant without the truck feed
The instant-flip behavior stays, using a tiny message channel instead: when someone ticks OOS, the app sends one small broadcast that the other open sessions apply to the shared OOS store already in place. Cost: one message per actual click instead of one per truck rewrite. Result is visually identical to today.

### 3. Convert the other truck watchers to refresh
Truck list, Truck Sales, Drivers, Trailers and Live Oil Change watchers stop listening to the truck feed and instead refresh when the window regains focus plus every 60 seconds. Same freshness people actually perceive, zero live messages.

### 4. Trim the rest of the live feed
Remove from live updates the tables that don't need instant delivery, letting the same refresh-on-focus pattern cover them: `user_roles`, `recruiter_salary_payments`, `driver_company_history`, `truck_note_history`, `order_files`, `lost_day_notes`, `weekly_plans`, `daily_report_entries`.
Keep live: `orders`, `pickup_drops`, `order_transfers`, `truck_notes` — the ones the Reports grid depends on while several people work in it together.

### 5. Publish the consolidation already written
The shared single-connection bus and the background-tab pause are in the code but not live yet. Publishing collapses the measured ~1,100 open listeners (for ~40 people) to one per table, and stops all-day traffic to tabs nobody is looking at.

### 6. Stop the re-join storm
Reuse the existing connection when the login token refreshes instead of tearing down and re-joining, and debounce joins so briefly visited pages never join.

Expected outcome: from hundreds of thousands of messages per hour to low thousands, with no visible change — including the OOS checkbox still flipping instantly for everyone.

## Technical notes

- Migration: `ALTER PUBLICATION supabase_realtime DROP TABLE public.trucks;` plus the eight tables in step 4 (each reversible with `ADD TABLE`).
- `src/hooks/useTruckOosRealtime.ts`: replace the `postgres_changes` binding on `trucks` with a `supabase.channel('oos').on('broadcast', …)`; `src/components/reports/TruckOosCheckbox.tsx` sends the broadcast after the RPC succeeds; `useTruckOosOverrides` store is unchanged.
- Convert to `refetchOnWindowFocus` + 60 s `refetchInterval` and drop `subscribeTable("trucks", …)`: `useTrucksRealtime`, `useTruckSalesRealtime`, `useDriversRealtime`, `useTrailersRealtime`, `LiveOilChange`, `useTruckNoteHistory`, `useWeeklyPlans`, `TransferList`, `YardLoads`, `WeeklyPlanDialog`, the `dailyReport` tables.
- `src/hooks/realtimeBus.ts`: multiplex the remaining four tables onto one channel, add a 500 ms join debounce, and route token refresh through `realtime.setAuth` without re-joining.
- `useReportsRealtime` stays app-level with its 1 s debounce — it is the one shared watcher for orders/stops/transfers.
- Verification: after publishing, compare the Supabase realtime message count over 24 hours against the current baseline; check OOS still flips across two sessions and Reports still patches rows on order/stop edits.
