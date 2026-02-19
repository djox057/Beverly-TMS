

## Fix: "Left at Yard" Overwrites Original Driver When Used on Already-Transferred Load

### Problem

When "Left at Yard" is clicked on a load that already has a recovery/transfer driver assigned, it **overwrites** the `original_*` fields with the current recovery driver and wipes all existing `order_transfers` records.

**What happened with load #1276247 (internal 8224):**
1. Pablo Ortiz (truck 5870) was the original driver
2. "Left at Yard" was clicked -- saved Pablo into `original_*` fields, cleared `driver1_id`/`truck_id`
3. A recovery driver (Reginal Jones) was assigned from YardLoads -- set `driver1_id` to Reginal, created `order_transfers` seq 0 (Pablo) and seq 1 (Reginal)
4. "Left at Yard" was clicked **again** -- overwrote `original_*` with Reginal (the current `driver1_id`), cleared `driver1_id` again
5. A new recovery driver (Robert Bolton) was assigned -- the YardLoads handler **deleted all existing transfers** (line 528-531) then created seq 0 (Reginal) and seq 1 (Robert)

Pablo Ortiz is now completely gone from the load.

### Root Cause

Two bugs working together:

**Bug 1 - `handleLeftAtYard` (EditOrder.tsx line 2861-2872):** Always overwrites `original_*` fields with the current assignment, regardless of whether the order already has an original driver saved. It doesn't check `is_recovery` or existing `order_transfers`.

**Bug 2 - `handleAssignTransferDriver` (YardLoads.tsx line 527-531):** Always deletes ALL existing `order_transfers` and recreates from scratch with only 2 records (seq 0 and seq 1), destroying any chain of transfers.

### Fix

**File: `src/pages/EditOrder.tsx` -- `handleLeftAtYard` function (lines 2801-2928)**

When `is_recovery` is already true (load already has a transfer), instead of overwriting `original_*`:

1. Get the current `order_transfers` to find the highest sequence number
2. Update the **last** transfer record (the current recovery driver) to add transfer location/time (the handoff point where they left the trailer at the yard)
3. Clear `driver1_id`/`truck_id` on the order (same as before -- trailer is at yard, no active driver)
4. Do NOT touch `original_*` fields -- they already hold the true original driver

When `is_recovery` is false (first time left at yard), keep existing behavior unchanged.

**File: `src/pages/YardLoads.tsx` -- `handleAssignTransferDriver` function (lines 526-557)**

Instead of deleting all transfers and recreating:

1. Check if `order_transfers` already exist for this order
2. If they exist, **append** a new transfer with the next sequence number instead of wiping and recreating
3. If they don't exist, create seq 0 and seq 1 as before (first-time assignment)

### Technical Details

**EditOrder.tsx `handleLeftAtYard` changes:**

```text
// At the top of the function, after getting currentOrder:
// Check if this order already has transfers
if (currentOrder.is_recovery) {
  // ALREADY A TRANSFER LOAD - add handoff point to last transfer, clear current driver
  
  // Get existing transfers
  const { data: existingTransfers } = await supabase
    .from("order_transfers")
    .select("*")
    .eq("order_id", id)
    .order("sequence_number", { ascending: false })
    .limit(1);
  
  const lastTransfer = existingTransfers?.[0];
  
  if (lastTransfer) {
    // Update last transfer with handoff location (where they left it at yard)
    await supabase.from("order_transfers")
      .update({
        transfer_city: "Lynwood",  // Default yard location
        transfer_state: "IL",
        transfer_datetime: new Date().toISOString(),
        miles: originalMilesCalc || lastTransfer.miles,
        driver_price: originalDriverPriceCalc || lastTransfer.driver_price,
      })
      .eq("id", lastTransfer.id);
  }
  
  // Clear current assignment (trailer stays at yard)
  // Do NOT overwrite original_* fields
  const updateData = {
    driver1_id: null,
    driver2_id: null,
    truck_id: null,
    recovery_miles: recoveryMilesCalc,
    notes: fullNotes,
  };
  
  await supabase.from("orders").update(updateData).eq("id", id);
  
  // Unassign trailer from truck
  // ... same truck cleanup as before
  
  return; // Skip the original_* overwrite path
}

// ... existing first-time left-at-yard code below (unchanged)
```

**YardLoads.tsx `handleAssignTransferDriver` changes:**

```text
// Instead of deleting all transfers:
// Check for existing transfers
const { data: existingTransfers } = await supabase
  .from("order_transfers")
  .select("sequence_number")
  .eq("order_id", selectedOrderForTransfer.id)
  .order("sequence_number", { ascending: false })
  .limit(1);

if (existingTransfers && existingTransfers.length > 0) {
  // Append new transfer with next sequence number
  const nextSeq = existingTransfers[0].sequence_number + 1;
  
  await supabase.from("order_transfers").insert({
    order_id: selectedOrderForTransfer.id,
    sequence_number: nextSeq,
    driver1_id: data.transferDriverId,
    truck_id: data.transferTruckId,
    trailer_id: yardLoadTrailerId,
    miles: data.recoveryMiles,
    driver_price: data.recoveryDriverPrice,
    transfer_city: data.transferCity,
    transfer_state: data.transferState,
    transfer_address: data.transferAddress || null,
    transfer_datetime: data.transferDatetime,
  });
} else {
  // No existing transfers -- create seq 0 (original) and seq 1 (new)
  // ... existing code for first-time assignment
}
```

### Files Modified

1. `src/pages/EditOrder.tsx` -- `handleLeftAtYard` function: add `is_recovery` check, branch to append-only path
2. `src/pages/YardLoads.tsx` -- `handleAssignTransferDriver` function: check for existing transfers before deleting, append instead of recreate

### Impact

- Fixes the immediate bug: original driver is preserved when "Left at Yard" is used multiple times
- Supports chains of 3+ transfers (e.g., Pablo -> Reginal -> Robert)
- No schema changes needed
- Existing loads with correct data are unaffected

