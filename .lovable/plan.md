

## Add Fallback Coordinates for DH Miles When Driver Has No Previous Load

### Problem
When a driver has no previous load history, the DH miles calculation returns null and no DH miles are computed. The system should fall back to a default location (41.5380303017491, -87.57861745311115) for the calculation.

### Changes

**`src/hooks/useTruckLastDelivery.ts`**

When no previous orders are found for the driver (or no delivery address can be built), instead of returning `null`, return a fallback result using the default coordinates formatted as an address string. This way the existing DH calculation flow in NewOrder.tsx works without any changes.

- After the "no orders found" check, return a fallback object with a placeholder address representing the default coordinates
- The address will be the coordinates themselves: `"41.5380303017491,-87.57861745311115"` -- however, since the DH calculation uses `geocodeAddress()` which expects a real address, we need a different approach

**Better approach -- `src/pages/NewOrder.tsx`**

Update the DH miles calculation logic (where `lastDelivery.deliveryAddress` is used with `calculateDhMiles`) to fall back to calculating from the default coordinates when `lastDelivery` is null.

- When `lastDelivery` is null, use `"41.538030, -87.578617"` as the origin address for the DH calculation (Mapbox geocoder accepts coordinate pairs as input)
- This keeps the hook clean and puts the fallback logic where the DH calculation is triggered

**Specifically in `src/pages/NewOrder.tsx`:**

Find where `lastDelivery.deliveryAddress` is used in the DH miles auto-calculation and update the condition:
- Currently: only calculates DH if `lastDelivery` exists
- New: if `lastDelivery` is null, use `"41.538030,-87.578617"` as the fallback delivery address for the DH calculation

### Technical Details

In NewOrder.tsx, the DH calculation effect currently checks `if (lastDelivery?.deliveryAddress && firstPickupAddress)`. Change to:

```typescript
const dhOriginAddress = lastDelivery?.deliveryAddress || "41.538030,-87.578617";
if (dhOriginAddress && firstPickupAddress) {
  const dh = await calculateDhMiles(dhOriginAddress, firstPickupAddress);
  // ... set DH miles
}
```

This ensures:
- Driver with previous load: DH from last delivery address (existing behavior)
- Driver with no previous load: DH from the default base location (41.5380303017491, -87.57861745311115)

