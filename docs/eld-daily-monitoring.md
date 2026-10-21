# ELD daily monitoring

The `/eld` page and navigation item are restricted to the exact `admin` and `maintenance` roles. Maintenance users with `profiles.is_eld` see only their assigned drivers and tasks. Admins and maintenance users with `profiles.is_eld_manager` manage the full roster, assignments, and side tasks. Other maintenance users can open the page but receive no driver data.

## Daily work

Each active driver has zero or one assigned ELD worker. Admins and ELD managers assign eligible maintenance users directly in the ELD person column. Team drivers have separate checklist rows and may share a truck number.

Each Monday–Friday, in `America/Chicago`, the page shows fresh Yesterday log, Forms, and PTI checkboxes plus an empty comment. All three checks are required for the row to be complete. Previous days retain their driver/truck/worker snapshots, comments and checks. Workers can edit today only; managers can correct past entries. Every saved field change, assignment, and task change is attributed in Activity.

Side tasks have a description, assignee, work date, completion actor and timestamp. Managers add tasks for today; tasks stay on their original date. Nothing carries into the next day.

The hourly `eld-daily-roster` cron job creates weekday snapshots even if nobody opens the page. Loading today's page also reconciles the roster. Open pages refresh every minute and follow Chicago midnight automatically. Inactive drivers disappear from today's view while their saved history remains.

## Deployment order

1. Apply `supabase/migrations/20261021132641_eld_daily_monitoring.sql` and then `supabase/migrations/20261021132947_eld_history_references.sql` to the TMS project (`wjkbtagwgjniilmgwutb`, FleetCarrier). It requires the existing `pg_cron` extension. This is an additive migration, but it also protects ELD tags against profile self-service changes and registers the hourly job.
2. Deploy the frontend. The ELD page requires the migration before it can load work. Existing Users edits remain compatible with the old schema; the ELD manager toggle stays disabled until the new column exists.
3. In Users, enable ELD manager for the appropriate maintenance user(s). Existing ELD flags remain intact; no manager tag or driver assignment is preselected.
4. Assign active drivers in ELD. Check a row and add a side task, then verify Activity and the selected date's history.

No new account role or external ELD/HOS integration is introduced. Public tables have read-only authenticated grants and RLS; all writes use validated RPCs. Privileged implementations are in the non-exposed `eld_private` schema. Assignment changes and roster refreshes share a transaction lock to prevent stale assignment snapshots.

## Validation

- `npm test -- src/lib/eld.test.ts src/pages/Eld.test.tsx src/components/UpcomingDriversAccess.test.tsx`
- `npm run typecheck`
- `NODE_OPTIONS=--max-old-space-size=8192 npm run build`
- Isolated database tests: install `@electric-sql/pglite` outside the repository and run `ELD_PGLITE_MODULE=/absolute/path/to/pglite/dist/index.js node scripts/tests/eld-database.mjs`. The migration runs unchanged against PostgreSQL; only the cron scheduler is stubbed. Run on a weekday. This covers grants/RLS, ELD tag escalation, cross-worker access, invalid fields, history, reassignment, deactivation, task completion, audit attribution and anonymous access. It also checks that existing driver/account deletion remains possible while historical work is retained. It does not validate the production cron service.
