

## Fix: Transfer Segment Location Mapping — Use Previous Transfer's Handoff

### Root Cause

The handoff location/date is stored on the **originating** transfer record (seq 0), not on the receiving transfer (seq 1). In the DB for load 10936:

- Seq 0 (Pablo/Orig): `transfer_city=Lynwood, IL`, `transfer_datetime=2026-03-19`
- Seq 1 (Rolando/Rec): `transfer_city=null`, `transfer_datetime=null`

The current code tries to read the **next** transfer's handoff for delivery and the **current** transfer's handoff for pickup — but the data model stores the handoff point on the transfer that **initiated** the handoff, not the one that received it.

### How It Should Look

- **Pablo Ortiz (Orig)**: Pickup = El Paso, TX (03/16) → Delivery = Lynwood, IL (03/19)
- **Rolando Gonzalez (Rec)**: Pickup = Lynwood, IL (03/19) → Delivery = Huron, OH (03/20)

### Fix

**File:** `src/pages/Trips.tsx` (lines 878-897)

Change the chain logic so:
- **DELIVERY** for each segment uses the **current** transfer's own `transfer_city/state/datetime` (if it has one). If null (last segment), use order's delivery.
- **PICKUP** for non-original segments uses the **previous** transfer's `transfer_city/state/datetime`. If null, fall back to order's pickup.

```typescript
const prevTransfer = idx > 0 ? transfers[idx - 1] : null;

// DELIVERY: current transfer's handoff is where this segment ends
// Last segment (no handoff data) delivers to order's final destination
const segDeliveryCity = transfer.transfer_city || order.deliveryCity;
const segDeliveryState = transfer.transfer_state || order.deliveryState;
const segDeliveryDate = transfer.transfer_datetime || order.deliveryDate;

// PICKUP: original uses order pickup; others use previous transfer's handoff
const segPickupCity = isOriginal ? order.pickupCity : (prevTransfer?.transfer_city || order.pickupCity);
const segPickupState = isOriginal ? order.pickupState : (prevTransfer?.transfer_state || order.pickupState);
const segPickupDate = isOriginal ? order.pickupDate : (prevTransfer?.transfer_datetime || order.pickupDate);
const segPickupDatetime = isOriginal ? order.pickupDatetime : (prevTransfer?.transfer_datetime || order.pickupDatetime);
```

This matches the actual data model: seq 0 stores the handoff point where the original driver dropped the load, so seq 0's delivery = Lynwood, IL and seq 1's pickup = Lynwood, IL (from prev transfer). Seq 1 has no handoff data, so its delivery falls through to order's delivery = Huron, OH.

Single-location change, no other files affected.

