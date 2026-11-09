# Turnover analytics

The existing admin Turnover List now opens an overview with office and individual
dispatcher filters, monthly trends, previous-period comparison, and paginated
departure details. The original list remains available in its own tab.

## Scope and calculations

- New analytics starts April 1, 2026. March and earlier source records and the
  original list are unchanged. Selecting March offers the original list with
  that exact date range.
- Average active drivers = summed daily active driver counts / observed days.
  Teams count as two drivers. Missing snapshot days are displayed and excluded
  from the average, rather than treated as zero.
- Turnover rate = departures flagged `counts_as_turnover` / average active
  drivers * 100. With no active base, the rate is unavailable. Rates can exceed
  100%; they are not capped or annualized.
- Departure share = filtered departures / all counted departures in the same
  period * 100. Office/dispatcher filters never reduce this denominator.
- Whole-month comparisons use the preceding whole month; month-to-date uses
  the matching elapsed days, capped to the preceding month's length. Other
  date ranges compare with an equally long preceding period.
- Dispatcher reassignment creates no departure. Reactivations are retained as
  separate events and do not erase previous departures.

## Historical limits

Setup copies only currently preserved inactive-driver departures dated April 1
or later into new private tables. Historical averages use existing
`dispatcher_daily_driver_counts`. Old office attribution uses a frozen copy of
dispatcher offices at installation; actual historical office membership is not
available. Departures erased by a past reactivation cannot be reconstructed.
The UI labels these periods as estimates and displays missing-day coverage.
No existing driver, assignment, count, or termination-note rows are backfilled.

## Ongoing capture

An after-update trigger records active/inactive transitions with driver name,
dispatcher, office, company, turnover flag, and departure reason. History has no
cascading foreign keys to drivers/users, so deletion and reactivation preserve
it. Attribution uses the departure-time dispatcher/office snapshot.

`turnover-daily-roster` checks hourly at minute 55 and captures at Chicago
23:55, including daylight-saving changes. Other checks return immediately.
An advisory lock prevents concurrent captures; complete snapshots cannot be
replaced. The initial snapshot is provisional. Today's metrics use the live
roster and remain provisional until the next date. Closed missing days are
reported explicitly rather than guessed.

## Access and cost

`turnover_private` is not exposed through the API. All private tables have RLS
and no authenticated table privileges. Public RPCs are SECURITY INVOKER wrappers
around private implementations that require a real admin role from `user_roles`
or a service-role JWT; user metadata cannot grant access. Anonymous RPC execution
is revoked. Existing page access is unchanged.

The client fetches aggregate metrics with a 60-second cache. Departure details
load only when opened, 50 per page. No AI or external provider is used. Daily
storage is one compact roster row per active driver, plus status-change events.

## Validation

```sh
npm test -- --run src/lib/turnoverMetrics.test.ts src/components/TurnoverDashboard.test.tsx src/pages/TurnoverList.test.tsx
npx eslint src/lib/turnoverMetrics.ts src/components/TurnoverDashboard.tsx
NODE_OPTIONS=--max-old-space-size=8192 npm run build
```

The 18 frontend/math tests and build pass. SQL regression checks are in
`supabase/tests/turnover_rates.sql`; these use a temporary fixture with only the
new trigger and roll back, avoiding operational driver/email triggers. They
cover departure flags, duplicate prevention, reactivation/deletion retention,
pagination, authorization, and preservation of March counts. Production
read-only checks also verify RPC availability and table/anonymous restrictions.
The final RPC wrapper migration has no turnover-related security advisories.

Repository-wide typecheck remains blocked by existing duplicate generated RPC
types and the unrelated missing truck `fleet_service_snapshot` field; it reports
no new turnover errors.

## Rollback

Revert the frontend commit to restore the original default page. If capture must
also stop, unschedule only `turnover-daily-roster` and drop only the
`turnover_capture_status` trigger on `public.drivers` through a new migration.
Keep the private history tables for recovery. Do not modify existing daily-count
jobs or historical source rows.
