

## Problem

When editing a driver who is assigned as **driver 2** on a truck (e.g., Miguel Reyes on truck 0898), the system incorrectly shows a "Reason for Truck Change" conflict dialog saying the truck is assigned to another driver (the driver 1, Cresenciano Reyes). This happens because the code doesn't track whether the editing driver is driver 1 or driver 2 on their truck.

There are multiple related bugs:
1. **Conflict check** treats driver 2 as a stranger to their own truck (since it only checks `driver1_id`)
2. **Save logic** always writes the driver into the `driver1_id` slot, which would overwrite the actual driver 1
3. **Available trucks list** only considers `driver1_id` when determining which truck belongs to the editing driver

## Fix

Track whether the editing driver is assigned as driver 1 or driver 2, and use that information throughout the edit flow.

### Technical Details

**File: `src/pages/Drivers.tsx`**

1. **Add a ref to track driver position** (near line 131):
   - Add `isDriver2Ref = useRef(false)` to track if the editing driver is driver 2 on their truck

2. **Set driver position in `openEditDialog`** (near line 1203):
   - After fetching `truckData`, also fetch `driver1_id` and `driver2_id`
   - Set `isDriver2Ref.current = true` if the driver matches `driver2_id`

3. **Fix `checkAssignmentConflicts`** (line 614-625):
   - Skip the driver1 conflict check if the driver IS driver 2 on the same truck (i.e., truck hasn't changed and they're driver 2)
   - Only flag a conflict when the driver is being moved to a **different** truck that already has a driver 1

4. **Fix `editingDriverTruckId`** (line 1276-1278):
   - Also check `driver2_id` when finding the editing driver's current truck

5. **Fix save logic** (lines 750-758):
   - When `isDriver2Ref.current` is true and the truck hasn't changed, update `driver2_id` instead of `driver1_id`
   - When the driver is being moved to a new truck, the existing behavior (assigning as driver1) may be acceptable, or we should preserve driver position

6. **Reset the ref** when the edit dialog closes

