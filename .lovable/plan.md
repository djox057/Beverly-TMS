# Cut realtime messages drastically

## What the measurements show

Checked directly against the database just now:

- Only 13 tables broadcast live updates: `trucks`, `orders`, `pickup_drops`, `order_transfers`, `daily_report_entries`, `order_files`, `truck_notes`, `truck_note_history`, `lost_day_notes`, `weekly_plans`, `user_roles`, `driver_company_history`, `recruiter_salary_payments`.
- Over a 2-minute sample tonight, row changes on all of those were essentially zero, and in the last hour: 12 orders, 12 stops, 15 daily-report rows, 0 trucks. The background fuel/miles writes now go to the silent telemetry table, as intended.
- So the remaining volume is not caused by the number of database changes. It is caused by **fan-out**: every change is delivered once per open listener, and the published app still runs the old code with several listeners per table per person (measured earlier: ~1,100 open listeners for ~40 people). One order change becomes several hundred billed messages.
- On top of that, each listener re-joins on every hourly token refresh and on every page navigation that mounts a page-level listener.

Note: the exact message counter lives in the Supabase dashboard and cannot be read from here, so the target below is an estimate based on listener count and change rate.

## Plan

### 1. Publish the consolidation that is already written (prerequisite)
The shared one-connection-per-table bus and the background-tab pause are already in the code but not live. Publishing alone should take ~1,100 listeners down to roughly 40 x 13 and remove all-day background-tab traffic.

### 2. Shrink the broadcast list to what genuinely needs to be live
Remove from live broadcasting the tables nobody needs instant updates for, and let the app's existing refresh-on-focus / interval refresh cover them:
`user_roles`, `recruiter_salary_payments`, `driver_company_history`, `truck_note_history`, `order_files`, `lost_day_notes`, `weekly_plans`, `daily_report_entries`.

Keep live: `orders`, `pickup_drops`, `order_transfers`, `trucks`, `truck_notes` — the five that drive the Reports grid people watch together.

### 3. One connection per person, not thirteen
Replace the per-table connections with a single connection per signed-in person that carries all remaining tables, so joins and deliveries stop multiplying by table count.

### 4. Only subscribe on the screens that need it
Today several listeners are mounted app-wide for the whole session. Scope truck/notes/stop listeners to the pages that display them (Reports, Trucks, Daily Report, Live Oil Change) and drop them on navigation away. People sitting on Analytics, EFS, Fleets etc. stop receiving anything.

### 5. Stop the re-join storm
Reuse the existing socket on token refresh instead of tearing down and re-joining, and add a short debounce so a page that mounts and unmounts quickly does not join at all.

### 6. Replace live updates with refresh where the data is not collaborative
Pages that only need "reasonably fresh" (Truck Sales, Transfer List, Yard Loads, Weekly Plan, Truck Note History, Live Oil Change) switch to refresh-on-focus plus a 60-second interval. No live messages at all for those.

Expected outcome: from hundreds of thousands per hour to low thousands per hour, with the Reports grid still updating live as it does today.

## Technical notes

- Migration: `ALTER PUBLICATION supabase_realtime DROP TABLE ...` for the eight tables in step 2 (reversible with ADD TABLE).
- `src/hooks/realtimeBus.ts`: switch from one channel per table to a single multiplexed channel with N `postgres_changes` bindings; keep the ref-counted subscribe API and the hidden-tab pause so callers stay unchanged; add a 500 ms join debounce and a socket-level `setAuth` path that does not re-join.
- Hooks to rescope from app-level to page-level: `useTruckSalesRealtime`, `useTrucksRealtime`, `useDriversRealtime`, `useTrailersRealtime`, `useTruckOosRealtime`; convert `useTruckNoteHistory`, `useWeeklyPlans`, `TransferList`, `YardLoads`, `LiveOilChange`, `WeeklyPlanDialog` and the `dailyReport` tables to `refetchOnWindowFocus` + 60 s `refetchInterval`.
- `useReportsRealtime` stays app-level (it is the one shared watcher) and keeps its 1 s debounce.
- Verification: after publishing, compare the Supabase realtime message count over 24 hours against today's baseline, and confirm Reports still patches rows on order/stop edits.
