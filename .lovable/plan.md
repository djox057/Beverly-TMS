# Cut realtime message volume

## What the analysis found

Live-update traffic is dominated by machine writes to the truck list, not by people using the app.

Verified facts:

- Only 13 tables broadcast live updates. The heavy ones are `trucks`, `orders`, `pickup_drops`, `order_transfers`, `daily_report_entries`, `truck_notes`, `order_files`.
- All 489 trucks were written in the last hour by background jobs:
  - fuel sync runs every 5 minutes and writes `fuel_level` on every truck
  - distance sync runs every 10 minutes and writes `miles_away` / `eta_minutes` / `miles_away_updated_at` on every truck
  That is roughly 8,800 truck row changes per hour, ~200,000 per day.
- Every one of those changes is delivered to **each** open live connection. The app opens up to three separate truck connections per user (truck list, out-of-service watcher, truck-sales watcher), so one row change is billed several times per signed-in person. This is the bulk of the 103 million messages.
- By comparison, real user activity is tiny: 85 order changes and 103 stop changes per hour.
- Orders are also duplicated: three separate order connections run per user (global reports watcher, orders hook, reports date-window watcher) — the same change is delivered 3x.
- Several watchers listen to tables that don't broadcast at all (drivers, trailers, profiles, companies, brokers, transfer list). They cost nothing in messages but keep dead connections open, and the drivers "live update" silently does nothing today.

Expected result: roughly a 90–95% reduction in realtime messages, with no visible change to how the app behaves.

## Plan

### 1. Stop the fuel/distance jobs from broadcasting (biggest win)

Move the two machine-written groups of fields off the broadcasting `trucks` table into a new non-broadcasting `truck_telemetry` table (one row per truck: fuel level, miles away, ETA, last-updated stamps).

- The two background jobs write to `truck_telemetry` instead of `trucks`.
- The truck list, Reports, and map read telemetry with the trucks query (single extra fetch, merged in memory) and keep refreshing it on the existing polling interval.
- Keep the columns on `trucks` for a transition period and backfill telemetry from them, so nothing is lost if we need to step back.

This alone removes ~200,000 broadcast row changes per day.

### 2. One truck connection instead of three

Consolidate the truck list, out-of-service, and truck-sales watchers into a single shared truck subscription that fans out to the different caches in the app. Same behavior, one third of the deliveries.

### 3. One order connection instead of three

Same consolidation for orders / stops / transfers: keep the single app-level watcher and have the orders hook and the Reports date-window adapter subscribe to its in-app events instead of opening their own connections.

### 4. Pause live updates for hidden tabs

When the browser tab has been in the background for a couple of minutes, drop the subscriptions and re-subscribe (with a refetch) when the user comes back. Many users leave the app open all day in a background tab and are billed for every change.

### 5. Remove dead and unfiltered watchers

- Delete the postgres-change listeners on tables that don't broadcast (drivers, trailers, profiles, companies, brokers, transfer list, drug tests, yard actions), replacing the drivers one with cache refresh on the existing polling.
- The daily report has four separate components each listening to the whole table; collapse to one shared date-filtered subscription.
- Narrow the remaining subscriptions to the events they actually need (for example inserts/updates only, filtered by date where a date is already known).

## Technical notes

- New table `public.truck_telemetry` (truck_id PK referencing trucks, fuel_level, miles_away, eta_minutes, miles_away_updated_at, updated_at), with explicit GRANTs for anon/authenticated/service_role plus RLS mirroring current truck read access, and deliberately **not** added to `supabase_realtime`.
- Jobs to change: `hos-sync` (fuel_level write), `update-truck-distances` (miles/eta writes).
- Frontend touchpoints: `useTrucks`/`useTrucksRealtime`, `useTruckOosRealtime`, `useTruckSalesRealtime`, `useOrdersRealtime`, `useReportsRealtime`, `useReportsDateWindowAdapter`, `useDriversRealtime`, `useTrailersRealtime`, the `dailyReport` tables, plus the Reports/Trucks reads of `fuel_level` and `miles_away`.
- Verification: check the Supabase realtime message count over the following 24 hours and compare against the current baseline.
