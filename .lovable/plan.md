

## Problem

Truck #2391 has `needs_recovery = true` and `left_by_driver_id` set, but `driver1_id` is `null` (no driver assigned). The condition `driver1_id !== left_by_driver_id` evaluates to `true` because `null !== 'uuid'`, so the dialog incorrectly concludes a recovery driver is already assigned and shows only the "Remove Status" option.

## Fix

**File: `src/pages/YardArrivals.tsx` — line 575**

Add a null check for `driver1_id`:

```typescript
// Before:
const hasRecoveryDriverAssigned = truck?.needs_recovery && truck?.left_by_driver_id && truck?.driver1_id !== truck?.left_by_driver_id;

// After:
const hasRecoveryDriverAssigned = truck?.needs_recovery && truck?.left_by_driver_id && !!truck?.driver1_id && truck?.driver1_id !== truck?.left_by_driver_id;
```

This ensures `hasRecoveryDriverAssigned` is only true when there is actually a different driver assigned to the truck, allowing the dialog to show the "Assign Recovery Driver" step when `driver1_id` is null.

One-line change, no other files affected.

