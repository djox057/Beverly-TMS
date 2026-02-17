

## Change DH Miles Calculation to Use Driver's Last Delivery Instead of Truck's

### Problem
When a driver switches to a new truck, the DH (deadhead) miles are calculated from the last delivery of the **truck**, not the **driver**. This gives incorrect results because the truck may have had a completely different last delivery location with a different driver.

### Solution
Update the `useTruckLastDelivery` hook to look up the previous order by **driver ID** instead of **truck ID**.

### Changes

**1. `src/hooks/useTruckLastDelivery.ts`**
- Rename to conceptually track "driver's last delivery" (keep filename for minimal diff)
- Change the parameter from `truckId` to `driverId`
- Update the query to filter by `driver1_id = driverId OR driver2_id = driverId` instead of `truck_id = truckId`
- Update the query key accordingly
- Update the `enabled` check to use `driverId`

**2. `src/pages/NewOrder.tsx`**
- Change the hook call from `useTruckLastDelivery(truck || null, ...)` to `useTruckLastDelivery(driver1 || null, ...)`
- This ensures when a driver is selected (auto-filled from truck or manually set), the DH miles come from that driver's last delivery regardless of which truck they were on

### Technical Details

The query change in the hook:
```sql
-- Current: filters by truck
.eq('truck_id', truckId)

-- New: filters by driver (as driver1 or driver2)
.or(`driver1_id.eq.${driverId},driver2_id.eq.${driverId}`)
```

The hook call change in NewOrder.tsx (line ~278):
```typescript
// Current
const { data: lastDelivery } = useTruckLastDelivery(truck || null, firstPickupDatetime);

// New
const { data: lastDelivery } = useTruckLastDelivery(driver1 || null, firstPickupDatetime);
```

No changes needed in EditOrder.tsx since it doesn't use this hook.
