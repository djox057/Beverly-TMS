
## Multi-Pickup BOL Tracking in Reports

### Problem
When a load has multiple pickups, uploading 1 BOL marks ALL pickup stops as complete (green). It should only mark the first pickup as complete, matching how multi-drop loads work with POD files.

### How It Works Today (Multi-Drop Reference)
For deliveries with multiple drops, the code counts POD files and compares against the stop index:
- 1 POD = only first delivery turns green
- 2 PODs = first two deliveries turn green
- etc.

### Solution
Apply the same counting logic to pickups with BOL files.

### Changes

**1. `src/pages/Reports.tsx` - Inline `getPickupCellColor` (~line 1379)**
- Add a `stop` parameter (optional, like delivery version)
- Get all pickup stops sorted by sequence_number
- Count BOL files
- If multiple pickup stops and a specific stop is provided, only mark green if `bolCount > stopIndex`
- Single pickup or no stop: keep existing behavior

**2. `src/pages/Reports/helpers.ts` - Exported `getPickupCellColor` (~line 201)**
- Same changes as above: add `stop` parameter, add multi-pickup BOL counting logic

**3. `src/pages/Reports.tsx` - Calendar pickup cell rendering (~lines 2163, 2224)**
- Pass the current `stop` to `getPickupCellColor(order, previousComplete, stop)` so each pickup stop gets individually evaluated

### Technical Details

The BOL counting logic (mirroring the POD/delivery pattern):
```
const pickupStops = order.pickupStops ||
  order.pickup_drops?.filter(pd => pd.type === "pickup")
    .sort((a, b) => (a.sequence_number || 0) - (b.sequence_number || 0)) || [];
const bolCount = order.order_files?.filter(f => f.file_category === "BOL").length || 0;

if (pickupStops.length > 1 && stop) {
  const stopIndex = pickupStops.findIndex(s => s.id === stop.id);
  if (bolCount > stopIndex) {
    return green; // complete
  }
  // fall through to other checks (arrived, late, cyan, pending)
} else {
  // single pickup - original logic (hasBOL || hasPOD = green)
}
```

Four locations to update total: two function definitions and two call sites in the calendar rendering.
