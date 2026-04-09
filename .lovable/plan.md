## Fix: Dispatcher Tenure Not Showing for Drivers With Only a Removal Event

### Problem

Robert Madir's dispatcher history shows "No dispatcher history found" even though he was assigned to Alex (Andrej Sretenovic-Alex). 

**Root cause**: The `assignment_history` table only has ONE dispatcher entry for Robert -- the event where Alex was REMOVED (dispatcher_id=null, old_dispatcher_id=Alex). There is no earlier record of Alex being initially assigned, because either:

- Alex was set before the assignment history trigger was added, or
- The initial assignment predates the logging system.

The `calculateTenures` function in `tenureCalculator.ts` processes entries oldest-first. When it encounters this single entry:

- New entity = `dispatcher_id: null` (no dispatcher)
- Old entity = `old_dispatcher_id: Alex`

Since `currentTenure` is null (first entry), nothing gets closed. Then the new entity is null, so no new tenure starts. Alex's entire tenure is silently dropped.

### Fix

In `calculateTenures` (around line 189-240 in `tenureCalculator.ts`), when processing the **first entry** and `currentTenure` is null, check if `oldEntity` has a valid id/name. If so, synthesize an implied prior tenure that ran from an unknown start date up to this entry's date.

Specifically, before opening a new tenure for the current entity, insert a completed tenure for the old entity:

```
// If this is the first entry and oldEntity is set, 
// it implies a prior tenure we have no start record for
if (!currentTenure && (oldEntity.id || oldEntity.name)) {
  tenures.push({
    entityId: oldEntity.id,
    entityName: oldEntity.name,
    startDate: entryDate,  // Best we can do — use same date
    endDate: entryDate,
    durationDays: 1,
    endReason: entry.reason || null,
    changedByName: entry.changed_by_name,
    isGap: false,
    oldEntityId: null,
    oldEntityName: null,
    historyEntryIds: [entry.id],
  });
}
```

This applies to ALL tenure types (driver, truck, trailer, dispatcher), fixing the same class of bug everywhere -- any entity whose initial assignment predates the history system will now show up when a removal event exists.

### File Changed

- `src/utils/tenureCalculator.ts` — Add implied prior tenure synthesis at lines ~199-200, inside the `entityChanged` block when `currentTenure` is null.