
# Plan: Keep Trailer When Changing Truck on Drivers Page

## Problem Summary

Currently, when editing a driver and changing their truck, the trailer field auto-fills with the new truck's trailer, replacing the driver's current trailer. The user wants the trailer to "stay" with the driver (not change), so that:
- The driver keeps their current trailer
- The trailer moves with the driver to the new truck
- The new truck's previous trailer gets disconnected

## Current Behavior

When selecting a new truck in the Edit Driver dialog:

```typescript
// Line 2399-2407 in Drivers.tsx
onValueChange={(value) => {
  const selectedTruck = trucks?.find((truck) => truck.id === value);
  setFormData({
    ...formData,
    truck_id: value,
    trailer_id: selectedTruck?.trailer_id || "",  // ← AUTO-FILLS with new truck's trailer
  });
  setSelectedTruckId(value);
}}
```

This causes the driver's trailer to be replaced with whatever trailer is on the new truck.

## Solution

### Change 1: Remove Trailer Auto-Fill on Truck Change (Edit Dialog)

Modify the truck `onValueChange` handler in the **Edit Driver** dialog to **not** change the trailer:

**File:** `src/pages/Drivers.tsx`
**Lines:** 2399-2407

**Before:**
```typescript
onValueChange={(value) => {
  const selectedTruck = trucks?.find((truck) => truck.id === value);
  setFormData({
    ...formData,
    truck_id: value,
    trailer_id: selectedTruck?.trailer_id || "",  // Replaces trailer
  });
  setSelectedTruckId(value);
}}
```

**After:**
```typescript
onValueChange={(value) => {
  setFormData({
    ...formData,
    truck_id: value,
    // Keep current trailer - don't auto-fill from new truck
  });
  setSelectedTruckId(value);
}}
```

### Change 2: Update Add Driver Dialog (Optional - for consistency)

The same pattern exists in the **Add Driver** dialog (lines 1450-1458). For new drivers, auto-filling from the truck may still make sense since they don't have a trailer yet. However, if empty string is selected (no trailer assigned), it should remain empty unless the user explicitly picks one.

**Recommendation:** Keep the Add Driver auto-fill as-is (since new drivers don't have a pre-existing trailer), OR change it to be consistent:

```typescript
// Line 1450-1458
onValueChange={(value) => {
  setFormData({
    ...formData,
    truck_id: value,
    // For new drivers, could optionally auto-fill:
    // trailer_id: formData.trailer_id || selectedTruck?.trailer_id || "",
  });
  setSelectedTruckId(value);
}}
```

### Change 3: Update Save Logic to Clear Old Truck's Trailer

The current save logic (lines 739-805) already handles trailer assignment correctly. However, we need to ensure that when the trailer moves to the new truck, it's cleared from any other truck that had it:

**Current Code Already Does This (Line 742-748):**
```typescript
if (formData.trailer_id) {
  await supabase
    .from("trucks")
    .update({ trailer_id: null })
    .eq("trailer_id", formData.trailer_id)
    .neq("id", formData.truck_id);  // ← Clears trailer from all OTHER trucks
}
```

This is already correct! The trailer is cleared from any truck that currently has it (except the new truck being assigned).

### Change 4: Clear Trailer from OLD Truck When Driver Leaves

We should also clear the trailer from the driver's **old truck** when they move to a new truck. Currently, the old truck keeps its trailer.

**Add to save logic after clearing driver from old trucks (after line 772):**

```typescript
// Also clear trailer from the old truck if driver is moving to a new truck
if (origTruckId && formData.truck_id !== origTruckId) {
  await supabase
    .from("trucks")
    .update({ trailer_id: null })
    .eq("id", origTruckId);
}
```

---

## Example Walkthrough After Changes

**Initial State:**
- Driver "John" is on Truck **2365** with Trailer **T100**
- Truck **2400** has Trailer **T200** assigned

**Steps:**
1. Open Edit Driver dialog for John
2. Change truck from 2365 → 2400
3. Trailer field stays as **T100** (no auto-fill)
4. Click Save

**Database Updates:**
1. Clear T100 from any other truck: `UPDATE trucks SET trailer_id = null WHERE trailer_id = 'T100' AND id != '2400'`
2. Update Truck 2400: `{ driver1_id: John, trailer_id: T100 }`
3. Clear John from Truck 2365: `{ driver1_id: null }`
4. Clear trailer from old Truck 2365: `{ trailer_id: null }`

**Final State:**
- Truck **2400**: John + T100
- Truck **2365**: No driver, No trailer
- T200: Disconnected (not on any truck)

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/pages/Drivers.tsx` | Remove trailer auto-fill on truck change in Edit dialog (~line 2404) |
| `src/pages/Drivers.tsx` | Add logic to clear trailer from old truck when driver moves (~after line 772) |

## Technical Considerations

- **Assignment History**: The existing logic already logs trailer changes with the assignment reason, so the history will correctly show the trailer move.
- **Conflict Detection**: The `checkAssignmentConflicts()` function will still show a warning if the trailer being kept is currently on another truck.
- **Add Driver**: The behavior for new drivers can optionally remain as auto-fill since they have no pre-existing trailer.
