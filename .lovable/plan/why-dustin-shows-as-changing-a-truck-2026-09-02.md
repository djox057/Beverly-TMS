# Why "Dustin" shows as changing a truck

The log entry is real, but the truck change never happened. Dustin (dispatch role) could not change the truck — the database rejected it — yet the app still wrote a history entry saying he did.

## What the data shows

For driver Kwaku's history around July 3, 2026:

- 16:46 — one entry only, by Aleksandar Stojic-Dustin (role: dispatch): "5648 → 5645", reason "problems with the truck...". There is **no** matching automatic trigger entry, which means the `trucks` row was never actually updated.
- 17:25 — Luka Radosavljevic-Lucas (role: manager) performed the real move, and that produced the full set of automatic trigger entries.

## Root cause

Two independent writes happen when saving the driver dialog:

1. `UPDATE trucks ...` — blocked for dispatch (the trucks update policy allows afterhours, maintenance, admin, manager, accounting, safety, supervisor only). Supabase returns "0 rows updated" with **no error**, so the code continues as if it succeeded.
2. `INSERT INTO assignment_history ...` — allowed for everybody (the insert policy check is simply `true`), so the entry is written and the timeline shows a change that did not occur.

That is also why the timeline says the driver's current truck is 5648 while `trucks` shows him on 5645.

## Fix

1. **Stop silent failures**: in `src/components/EditDriverDialog.tsx`, add `.select("id")` to each truck assignment update and throw if no row comes back, so the save shows a real "You don't have permission to change truck/trailer assignment" error instead of pretending it worked.
2. **Only log what happened**: move the two `assignment_history` inserts (`truck_assignment`, `trailer_assignment`) after a confirmed successful truck update; skip them when the update affected no rows.
3. **Hide the impossible action**: disable the Truck and Trailer selectors in the driver dialog for users who lack truck-update permission (dispatch-only), matching the roles in the trucks update policy.
4. **Tighten the log table**: migration replacing the `assignment_history` insert policy check `true` with `has_any_role(ARRAY['afterhours','maintenance','admin','manager','accounting','safety','supervisor'])` so client code cannot write assignment history it isn't allowed to cause. (Trigger-written rows are unaffected — those functions are security definer.)
5. **Clean up the bad entry**: delete the phantom row `cc609011-0c54-4b5d-9f31-f40c9e245e7a` (and scan for other manual `truck_assignment` / `trailer_assignment` rows by dispatch-only users with no accompanying trigger row) so histories stop showing changes that never happened.

## Notes

- No change to what managers/admins can do; only dispatch-only users are affected.
- Step 5 is a data cleanup and will be listed for review before it runs.
