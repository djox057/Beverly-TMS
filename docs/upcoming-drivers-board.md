# Upcoming Drivers weekly board

The board tracks candidates before they exist in the main Drivers table. It preserves the spreadsheet's A–R column order, with recruiters, manually entered driver names, phone numbers, safety staff, and dispatchers in A–E. Sales, Time, APP and CH remain flexible text fields because their exact meanings have not been specified. Drug test is a company field, reflecting the supplied sheet.

Weeks run Monday–Sunday. A date selector and previous/next controls select a week. Each date has a collapsible section; Unscheduled entries are shown separately across all weeks. Arrived records retain their scheduled date and can be shown using All or Arrived. Tentative entries have a 50/50 badge. Archived records retain their history and can be restored.

## Chicago dates and times

Arrival dates use PostgreSQL `date`; arrival times use `time without time zone`. These are literal Chicago calendar and wall-clock values. The UI never converts an entered date/time using the browser timezone or serializes it as a UTC instant. Pure calendar arithmetic is used for weeks, including daylight-saving and year boundaries. The live clock uses America/Chicago only to identify Today/This Week. Audit events are stamped by the database in Chicago local time and displayed as stored. Internal created/updated metadata remains an instant and is not used to schedule arrivals.

## Access and editing

The existing route and navigation allowlist is unchanged. Database reads, history and private realtime use the same primary-role precedence as `useAuth.getPrimaryRole`, including mixed roles. Admin, manager, supervisor, safety, recruiting and dispatch can create/edit. Chicago management is read-only. Admin, manager and supervisor can archive/restore. Direct deletes, client-written history and metadata/version overrides are not granted.

Staff selectors use a narrow authenticated RPC exposing only user IDs, names and recruiting/safety/dispatch roles. Its definer implementation is in a separate unexposed schema and validates the caller; the public wrapper is invoker. The existing profiles/user_roles policies are unchanged. Only the new realtime topic is affected by the restrictive policies; broad pre-existing realtime policies cannot grant excluded roles access to this topic or let clients spoof its events.

## Saving and live updates

Saving an existing entry writes only changed fields and requires its loaded version to match. A conflict leaves the draft open; Reload latest requires confirmation before discarding edits. New entries use one stable random ID per create dialog so retrying a lost response cannot add duplicates. Archive/restore also uses version checking.

The list fetches the selected week plus unscheduled entries, with pagination and short generated previews. Full comments and the latest 20 audit events are loaded on demand. Reference selectors fetch only narrow name/ID projections and are cached for ten minutes. One private page subscription receives only `{id, version}` per saved change. Batched changed-row reads update the current board; full reconciliation happens on subscription/reconnection and explicit refresh. Hidden pages unsubscribe. There is no periodic database poll and no change to the shared realtime bus. Failed row refreshes keep pending IDs and stop automatic retries after three failures; a later event/reconnection can retry them. The UI reports interrupted updates.

## Scope

Drivers Complaints and its components are unchanged. Selecting a truck is planning information; it does not assign the truck or modify active drivers. There is no automatic promotion to Drivers, file upload, outbound contact, or spreadsheet import in this release. Import needs an explicit week for weekday-only headings and review of ambiguous staff-name matches; none of the supplied workbook records were inserted.

## Validation and deployment

- Frontend tests: `npx vitest run src/components/UpcomingDriversAccess.test.tsx src/components/upcoming-drivers`
- TypeScript: `npx tsc --noEmit -p tsconfig.app.json`
- Build: `npm run build`
- Database behavior: `PGLITE_MODULE=<path to installed @electric-sql/pglite/dist/index.js> node scripts/verify-upcoming-drivers-db.mjs`. The script creates an isolated in-memory Postgres fixture, including broad existing realtime policies, and executes the exact migration. It never connects to production.

Apply `20260915191425_upcoming_drivers_board.sql` followed by `20260915192105_upcoming_drivers_reference_history.sql` before deploying the frontend. Both migrations were applied to the linked project on September 15, 2026; repository filenames match the recorded remote migration versions. The follow-up allows only foreign-key-driven reference cleanup when staff accounts or trucks are deleted elsewhere, preserving the candidate and audit history. The change is additive; existing application tables and user records are not altered. No table-wide Postgres Changes subscription or publication change is introduced.

Rollback the frontend commit to return to the blank page. Keep the new tables and audit history to preserve any entered candidates. Do not drop populated tables as part of a routine rollback. If disabling the feature entirely, revoke the new table/RPC grants and stop its new broadcast trigger through a reviewed follow-up migration. Existing realtime policies are preserved; the three newly named topic-specific policies can be removed independently when retiring this feature.

Validation result: 48 frontend checks and 128 isolated database checks passed. Application TypeScript, targeted ESLint and the production build passed. Security advisors reported no findings naming the new feature. Browser screenshot verification could not run because Chromium downloads timed out; interactive DOM tests exercised the board and editor instead.
