

## Fix: Recovery Driver Shows Wrong Delivery Date in Trips

### Problem

For load #203711 (internal #6970), the recovery driver (Oldy Charles, seq 1) shows delivery date **02/06/2026** instead of the correct **02/11/2026**.

### Root Cause

In `src/pages/Trips.tsx` line 866, when building segments from `order_transfers`, the delivery date fallback uses `order.deliveryDatetime` (the raw order column `delivery_datetime = 02/06`) instead of `order.deliveryDate` (derived from the last pickup_drop stop = 02/11).

```typescript
// Line 866 - current (buggy)
const transferDeliveryDate = transfer.transfer_datetime || order.deliveryDatetime;
```

The `transfer_datetime` for the recovery segment (seq 1) is NULL, so it falls back to `order.deliveryDatetime` which is `2026-02-06` -- the order-level field that was never updated to reflect the actual last delivery stop.

The correct fallback is `order.deliveryDate`, which the transform computes from the last delivery pickup_drop (seq 3 = `2026-02-11`).

The same bug also exists on line 833 for the legacy Rec path:

```typescript
// Line 833 - same issue
const recDeliveryDate = order.recoveryDate || order.deliveryDatetime;
```

### Fix

**File: `src/pages/Trips.tsx`**

**Line 866** -- Change the fallback for `order_transfers` segments from `order.deliveryDatetime` to `order.deliveryDate`:
```typescript
// Before
const transferDeliveryDate = transfer.transfer_datetime || order.deliveryDatetime;

// After
const transferDeliveryDate = transfer.transfer_datetime || order.deliveryDate;
```

**Line 833** -- Same fix for the legacy Rec path:
```typescript
// Before
const recDeliveryDate = order.recoveryDate || order.deliveryDatetime;

// After
const recDeliveryDate = order.recoveryDate || order.deliveryDate;
```

### Why This Is Correct

- `order.deliveryDate` is computed in `ordersTransform.ts` line 24 as `pickupDrops.filter(pd => pd.type === "delivery").pop()` -- the **last** delivery stop datetime
- For load #203711, this is the seq 3 stop: Roulette, PA on 02/11/2026
- `order.deliveryDatetime` is the raw `delivery_datetime` column from the orders table, which is 02/06/2026 and was never updated when the recovery delivery stop was added

### Impact

- Only affects recovery/transfer loads where `transfer_datetime` is NULL on the last transfer segment
- The Orig segment (seq 0) always has `transfer_datetime` set, so it is unaffected
- No other pages or logic are impacted since this code is Trips-specific segment expansion

