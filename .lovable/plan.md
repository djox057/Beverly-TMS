

## Late Delivery Display Change in Reports — IMPLEMENTED

When a delivery stop has a scheduled time after 16:00 (4:00 PM) and is not yet completed (no POD), the **pickup row's red empty-day box** is replaced with ">>LATE DELL<<" using the same styling as the ">>>" in-transit indicator (plain text, bold, no red background).

### What was changed

1. **`src/pages/Reports/helpers.ts`**: Added `isLateDeliveryTime(datetimeStr)` helper that returns true if hour >= 16.
2. **`src/pages/Reports.tsx`**: 
   - After computing `isMissingPickup`, added `hasLateIncompleteDelivery` check scanning delivery orders on that day for late + incomplete stops.
   - Parent pickup div: red background suppressed when `hasLateIncompleteDelivery` is true.
   - Inner content: shows `>>LATE DELL<<` with `text-foreground font-semibold` styling instead of the red cell note.
   - Delivery cells remain unchanged.
