## Workflow (with example)

Today when you click **Done** on a driver in the edit dialog, `handleSaveTerminationNote` in `src/pages/Drivers.tsx` runs these steps in order:

1. Insert a termination note row.
2. Update the driver: `is_active=false`, set `termination_date`, clear `dispatcher_id`, clear `two_week_block_date`.
3. Find the truck where this driver is `driver1_id` or `driver2_id` and clear that driver slot + `trailer_id`.

Problem: step 2 nulls `drivers.dispatcher_id` and step 3 disconnects the truck, so any relationship between the driver's dispatcher and that truck is lost. The truck row still has its own `trucks.dispatcher_id` / `trucks.company_id`, but if the truck was never given one directly it can be left with no dispatcher after the driver leaves.

**New behavior:** right before we disconnect, we copy the driver's `dispatcher_id` and `company_id` onto the truck so the truck keeps that assignment.

### Example

- Driver **John Smith** has `dispatcher_id = Nemanja` and `company_id = AP Silver Trans LLC`.
- John is assigned as `driver1` on truck **7327**. Truck 7327's own `dispatcher_id` is empty and `company_id` is empty (nothing was ever set on the truck row directly).
- You open John's edit dialog and click **Done**.

Order of operations after the change:
1. Read John's current `dispatcher_id` (Nemanja) and `company_id` (AP Silver Trans LLC) from the in-memory `editingDriver` — before we null anything.
2. Find truck 7327 (the truck referencing John as `driver1_id`).
3. Update truck 7327: set `dispatcher_id = Nemanja` and `company_id = AP Silver Trans LLC` (only where the truck's value was empty — see decision below), then clear `driver1_id` and `trailer_id`.
4. Insert termination note.
5. Update John: `is_active=false`, `termination_date=today`, `dispatcher_id=null`, `two_week_block_date=null`.

Result: John is done and detached, but truck 7327 now still shows Nemanja / AP Silver Trans LLC in Trucks and Reports (matching the "driverless truck still shows its dispatcher/company" behavior we added earlier).

## Plan

1. **In `handleSaveTerminationNote` (`src/pages/Drivers.tsx`), before clearing the driver:**
   - Capture `editingDriver.dispatcher_id` and `editingDriver.company_id` into local variables.

2. **In the truck lookup step:**
   - Extend the `select` to include `dispatcher_id` and `company_id` (currently selects `id, driver1_id, driver2_id, company_id`; add `dispatcher_id`).

3. **When building `updateData` for the truck update:**
   - If the driver had a `dispatcher_id` and the truck's `dispatcher_id` is null, set `updateData.dispatcher_id = driver.dispatcher_id`.
   - If the driver had a `company_id` and the truck's `company_id` is null, set `updateData.company_id = driver.company_id`.
   - Still clear the matching `driver1_id` / `driver2_id` slot and `trailer_id` as today.

4. **Order:** perform the truck update before the driver update so we're always reading the driver's dispatcher/company from a still-populated record (belt-and-suspenders even though we also cache it in step 1).

5. **No schema changes.** No RLS or migration work — this is a client-side change to the Done flow only. Everything else (termination note insert, cache invalidation, reports refresh) stays as-is.

### Decision point for you

Should the truck **always** inherit the driver's dispatcher/company on Done (overwriting whatever the truck already has), or only fill in the truck's blanks (the default above)?

The safer default is "only fill blanks" so we don't stomp a manually-set truck dispatcher, but say the word and I'll switch to overwrite.

## Technical notes

- File touched: `src/pages/Drivers.tsx`, function `handleSaveTerminationNote` (around lines 1041–1110).
- The existing DB trigger from the earlier work preserves `trucks.dispatcher_id` / `company_id` when a driver disconnects, but it can't invent a value the truck never had — this change is what puts the value on the truck in the first place, at the moment of Done.
- No changes to `useTrucks`, `useReports*`, or edge functions are needed; those already surface truck-stored dispatcher/company for driverless trucks.
