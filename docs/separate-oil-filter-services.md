# Separate oil and air-filter services

Editing oil mileage in Live Oil Change could also change an air filter when both
edit targets referenced the same `Air Filter + Oil change` history entry.

The combined type is removed from new-entry, edit and spreadsheet-paste options.
The database check constraint also rejects it, including from older browser
sessions. Historical calculation helpers retain read compatibility for backups.

The migration keeps each original ID/source key as `Oil Change` and creates an
independent `Air Filter` row with the original date, mileage, invoice, notes,
facility, oil specification, author, creation timestamp and deletion status.
The filter's source key records the original ID. No raw truck readings or mileage
audit rows are changed. Earlier potentially incorrect filter values are preserved.

Before writing, it saves all truck rows, mileage history and service entries in
private backup tables. It locks service entries and trucks for the transaction,
uses short lock timeouts, and aborts if displayed fleet values, readiness or
historical metadata change. Only the filter's internal edit target may differ.

Validation:

- Read-only simulation on all 512 production trucks: zero changed fleet values
  and zero preexisting stale snapshots; 367 combined records, 349 active.
- SQL fixtures verify independent edits/deletions and oil mileage freshness.
- Production migration applied: 367 separate filters (349 active), zero remaining
  combined records, zero shared edit targets, zero changed fleet values or mileage
  audit rows across 512 trucks, and zero historical metadata mismatches.
- 121 focused tests passed across history, preserved authors, UI options, rejected
  paste, Live Oil Change and spreadsheet export. Production build passed with an
  8 GB Node heap allowance.
- Full TypeScript checking has existing duplicate RPC definitions in generated
  Supabase types and a required snapshot field missing from truck creation.
- The two private backup tables intentionally have RLS enabled with no client
  policies or grants. The corresponding informational advisor notices are expected.

Rollback: run `supabase/rollbacks/split_combined_oil_filter_services.sql` as a whole
and revert the matching frontend commit. It refuses to overwrite service rows
edited since the migration and aborts if fleet values change. Private backups are
retained. Later edits require individual review rather than a blind restore.
