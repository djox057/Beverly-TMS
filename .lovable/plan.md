

## Fix: Yard Arrivals 2-Week Notice Truck Number Still Showing N/A

### Root Cause

The assignment history fallback query (line 223-230 in `YardArrivals.tsx`) filters with:
```
.or(`driver1_id.eq.${driver.id},driver2_id.eq.${driver.id}`)
```

But when a driver is **removed** from a truck, the history record stores:
- `driver1_id: null` (new state — no driver)
- `old_driver1_id: <driver_id>` (previous state — the driver who was removed)
- `truck_id: <truck_id>` (the truck they were on)

So the query never matches the most recent record because it doesn't check `old_driver1_id` or `old_driver2_id`.

### Fix

**File:** `src/pages/YardArrivals.tsx` (line ~226)

Expand the `.or()` filter to also match on `old_driver1_id` and `old_driver2_id`:

```
.or(`driver1_id.eq.${driver.id},driver2_id.eq.${driver.id},old_driver1_id.eq.${driver.id},old_driver2_id.eq.${driver.id}`)
```

Also exclude `dispatcher_assignment` records (which have `truck_id: null`) to avoid wasting the `limit(1)` on a non-truck record:

```
.not("change_type", "eq", "dispatcher_assignment")
```

Single line change, no structural modifications needed.

