

## Problem

When clicking "Set Status" for a recovery yard action, the dialog opens but nothing happens because the truck lookup in `handleOpenStatusDialog` queries `trucks.driver1_id = action.driver_id`. If the driver (Crystal Davis) is inactive and no longer assigned to any truck, this returns no results — `truckId` becomes `""` and all subsequent database operations silently fail.

## Fix

**File: `src/pages/YardArrivals.tsx` — `handleOpenStatusDialog` function (lines 523-559)**

Update the truck lookup to use a fallback strategy:

1. First try `driver1_id = action.driver_id` (current behavior, works for active drivers)
2. If no truck found, try `left_by_driver_id = action.driver_id` (works for trucks already in recovery where the driver was unassigned)
3. If still no truck found, try matching by `truck_number` from the yard action record

This covers all scenarios:
- Active driver still on truck
- Inactive driver who left the truck (stored as `left_by_driver_id`)
- Edge case where only the truck number is available

Additionally, add a toast error if no truck can be found at all, so the user gets feedback instead of silent failure.

### Technical Detail

```typescript
// Current (line 526-530):
const { data: truck } = await supabase
  .from("trucks")
  .select("id, truck_number, needs_recovery, driver1_id, left_by_driver_id")
  .eq("driver1_id", action.driver_id)
  .maybeSingle();

// Updated — try multiple lookup strategies:
let truck = null;

// 1. Try by current driver assignment
const { data: t1 } = await supabase
  .from("trucks")
  .select("id, truck_number, needs_recovery, driver1_id, left_by_driver_id")
  .eq("driver1_id", action.driver_id)
  .maybeSingle();
truck = t1;

// 2. Fallback: try by left_by_driver_id (driver was unassigned but truck remembers them)
if (!truck) {
  const { data: t2 } = await supabase
    .from("trucks")
    .select("id, truck_number, needs_recovery, driver1_id, left_by_driver_id")
    .eq("left_by_driver_id", action.driver_id)
    .eq("needs_recovery", true)
    .maybeSingle();
  truck = t2;
}

// 3. Fallback: try by truck_number from the yard action
if (!truck && action.truck_number) {
  const { data: t3 } = await supabase
    .from("trucks")
    .select("id, truck_number, needs_recovery, driver1_id, left_by_driver_id")
    .eq("truck_number", action.truck_number.trim())
    .maybeSingle();
  truck = t3;
}

// Show error if no truck found
if (!truck) {
  toast({ title: "Error", description: "Could not find truck for this driver", variant: "destructive" });
  return;
}
```

No other files need changes. The dialog component and handlers already handle the data correctly once a valid `truckId` is provided.

