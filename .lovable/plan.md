

## Fix: Transfer Segment Pickup/Delivery Logic in Trips

### Problem
Currently, all segments inherit the original order's pickup city/state/date. The correct behavior for chained transfers is:

```text
1 Transfer:
  Orig:  pickup = order pickup  →  delivery = Handoff 1 (location + date)
  Rec:   pickup = Handoff 1     →  delivery = order delivery

2 Transfers:
  Orig:       pickup = order pickup  →  delivery = Handoff 1
  Recovery 1: pickup = Handoff 1     →  delivery = Handoff 2
  Recovery 2: pickup = Handoff 2     →  delivery = order delivery

N Transfers:
  Each segment's delivery = next transfer's handoff (or order delivery if last)
  Each segment's pickup = own transfer's handoff (or order pickup if original)
```

### Current Code (line 870-927)
- `transferDeliveryDate` (line 878) is set to the **current** transfer's `transfer_datetime` — this is wrong. For the original (seq 0), delivery should be **the next transfer's** handoff datetime/location. For middle transfers, delivery should also be the **next** transfer's handoff.
- Pickup city/state/date are never overridden — all segments show the order's original pickup.

### Implementation

**File:** `src/pages/Trips.tsx` (lines 870-927)

**Step 1:** Inside the `transfers.forEach` loop, look up the **next transfer** in the sorted `transfers` array to get the next handoff point:

```typescript
transfers.forEach((transfer: any, idx: number) => {
  // ... existing seq/badge logic ...
  
  const nextTransfer = transfers[idx + 1]; // next in sorted order
  const isLastSegment = !nextTransfer;
  
  // DELIVERY: use next handoff's location/date, or order's delivery if last segment
  const segDeliveryDate = isLastSegment 
    ? order.deliveryDate 
    : (nextTransfer.transfer_datetime || order.deliveryDate);
  const segDeliveryCity = isLastSegment 
    ? order.deliveryCity 
    : (nextTransfer.transfer_city || order.deliveryCity);
  const segDeliveryState = isLastSegment 
    ? order.deliveryState 
    : (nextTransfer.transfer_state || order.deliveryState);
  
  // PICKUP: for original (seq 0), use order's pickup; for others, use own handoff
  const segPickupCity = isOriginal ? order.pickupCity : (transfer.transfer_city || order.pickupCity);
  const segPickupState = isOriginal ? order.pickupState : (transfer.transfer_state || order.pickupState);
  const segPickupDate = isOriginal ? order.pickupDate : (transfer.transfer_datetime || order.pickupDate);
  const segPickupDatetime = isOriginal ? order.pickupDatetime : (transfer.transfer_datetime || order.pickupDatetime);
```

**Step 2:** In `segments.push()`, add these overrides:

```typescript
segments.push({
  ...order,
  // ... existing overrides (virtualId, driver, truck, etc.) ...
  pickupCity: segPickupCity,
  pickupState: segPickupState,
  pickupDate: segPickupDate,
  pickupDatetime: segPickupDatetime,
  deliveryCity: segDeliveryCity,
  deliveryState: segDeliveryState,
  deliveryDatetime: segDeliveryDate,
  deliveryDate: segDeliveryDate,
});
```

Remove the old `transferDeliveryDate` variable (line 878) — it's replaced by the new logic.

**No other files need changes.** The Excel export reads from these segment fields directly.

