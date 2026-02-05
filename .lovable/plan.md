
# Trip View Improvements Implementation

## Summary of Changes

This implementation addresses four requirements:

1. **Filter nested trips by assignment date** - Only show trips with delivery date on or before the assignment change date
2. **Update assignment history text** - Show "switched from" information instead of generic labels
3. **Hide short-term assignments** - Only show assignment changes lasting more than 1 day
4. **Remove black table header border** - Use subtle border styling instead

---

## Technical Implementation

### File 1: `src/utils/tenureCalculator.ts`

**Add old entity fields to Tenure interface (lines 4-13)**

Add two new optional fields to store the previous entity information:

```typescript
export interface Tenure {
  entityId: string | null;
  entityName: string | null;
  startDate: string;
  endDate: string | null;
  durationDays: number;
  endReason: string | null;
  changedByName: string | null;
  isGap: boolean;
  // NEW FIELDS:
  oldEntityId?: string | null;    // Previous entity before this tenure
  oldEntityName?: string | null;  // Previous entity name before this tenure
}
```

**Add helper function to get OLD entity from history entry**

Add after `getEntityFromEntry` function (around line 40):

```typescript
const getOldEntityFromEntry = (
  entry: AssignmentHistoryEntry,
  tenureType: TenureType
): { id: string | null; name: string | null } => {
  switch (tenureType) {
    case 'driver1':
      return { id: entry.old_driver1_id, name: entry.old_driver1_name };
    case 'driver2':
      return { id: entry.old_driver2_id, name: entry.old_driver2_name };
    case 'trailer':
      return { id: entry.old_trailer_id, name: entry.old_trailer_number };
    case 'truck':
      return { id: entry.old_truck_id, name: entry.old_truck_number };
    case 'dispatcher':
      return { id: entry.old_dispatcher_id, name: entry.old_dispatcher_name };
  }
};
```

**Store old values when creating tenures (lines 165-176 and 193-207)**

Update the tenure creation to include old entity values:

```typescript
// When closing previous tenure (around line 165):
tenures.push({
  entityId: currentTenure.entityId,
  entityName: currentTenure.entityName,
  startDate: currentTenure.startDate,
  endDate: entryDate,
  durationDays: calculateDuration(currentTenure.startDate, entryDate),
  endReason: entry.reason || null,
  changedByName: currentTenure.changedByName,
  isGap: !currentTenure.entityId && !currentTenure.entityName,
  oldEntityId: currentTenure.oldEntityId,     // NEW
  oldEntityName: currentTenure.oldEntityName, // NEW
});

// When starting new tenure (around line 180):
currentTenure = {
  entityId: entity.id,
  entityName: entity.name,
  startDate: entryDate,
  changedByName: entry.changed_by_name,
  oldEntityId: oldEntity.id,     // NEW - from getOldEntityFromEntry
  oldEntityName: oldEntity.name, // NEW
};
```

---

### File 2: `src/components/NestedDriverTripsDropdown.tsx`

**Add assignmentDate prop to interface (lines 63-76)**

```typescript
interface NestedDriverTripsInlineContentProps {
  driverName: string;
  driverId?: string;
  onSearchDriver?: (driverName: string) => void;
  onEditOrder?: (orderId: string) => void;
  onOrderPaidToggle?: (orderId: string, currentPaid: boolean, loadNumber: string) => void;
  colSpan: number;
  showMoveColumn?: boolean;
  showPaidColumn?: boolean;
  assignmentDate?: string; // NEW: YYYY-MM-DD format - only show orders with delivery <= this date
}
```

**Update component props destructuring (lines 78-87)**

```typescript
export function NestedDriverTripsInlineContent({
  driverName,
  driverId,
  onSearchDriver,
  onEditOrder,
  onOrderPaidToggle,
  colSpan,
  showMoveColumn = false,
  showPaidColumn = false,
  assignmentDate, // NEW
}: NestedDriverTripsInlineContentProps) {
```

**Add helper function for date extraction (after line 39)**

```typescript
// Helper to extract date part (YYYY-MM-DD) from datetime string
const extractDatePart = (dateStr: string | null | undefined): string | null => {
  if (!dateStr) return null;
  try {
    const normalizedStr = String(dateStr).replace(" ", "T");
    return normalizedStr.split("T")[0] || null;
  } catch (e) {
    return null;
  }
};
```

**Update filteredOrders memo to filter by assignment date (lines 168-176)**

```typescript
const filteredOrders = useMemo(() => {
  if (!orders) return [];
  return orders.filter((order) => {
    // Existing non-zero filter
    const miles = Number(order.mileage) || 0;
    const driverPay = Number(order.totalDriverPay) || 0;
    const freightAmount = Number(order.totalFreightAmountNoLumper) || 0;
    if (miles === 0 && driverPay === 0 && freightAmount === 0) return false;
    
    // NEW: Filter by assignment date if provided
    if (assignmentDate && order.deliveryDate) {
      const deliveryDatePart = extractDatePart(order.deliveryDate);
      if (!deliveryDatePart) return true; // Don't filter on invalid dates
      if (deliveryDatePart > assignmentDate) return false; // Exclude orders after assignment date
    }
    
    return true;
  });
}, [orders, assignmentDate]); // Added assignmentDate to dependencies
```

**Remove black border from table header (line 432)**

Change from:
```typescript
<div className={gridRowClass("bg-card text-xs border-y-2 border-foreground relative z-10")}>
```

To:
```typescript
<div className={gridRowClass("bg-card text-xs border-b border-border")}>
```

---

### File 3: `src/pages/Trips.tsx`

**Add duration filter to historyEntriesByWeek memo (around line 1166)**

After calculating tenures, filter out short-term assignments:

```typescript
// Calculate tenures using the same logic as truck history dialog
let tenures: Tenure[] = filterInfo.filterType === 'truck'
  ? calculateCombinedDriverTenures(filtered)
  : calculateTenures(filtered, 'truck');

// NEW: Filter out assignments that lasted 1 day or less (unless current)
tenures = tenures.filter(tenure => 
  tenure.endDate === null || tenure.durationDays >= 2
);
```

**Update history item description format (lines 1274-1304)**

Replace the current description building logic:

```typescript
const historyAsItems = weekTenures.map((tenure: Tenure) => {
  const isCurrent = tenure.endDate === null;
  const duration = formatTenureDuration(tenure.durationDays);
  const durationText = isCurrent ? `current-${duration}` : duration;
  
  let changeDescription: string;
  
  if (filterInfo.filterType === 'truck') {
    // Filtering by truck - showing driver changes
    const driverName = tenure.entityName || 'Unassigned';
    if (tenure.oldEntityName) {
      changeDescription = `Driver change: ${driverName}, switched from truck ${tenure.oldEntityName} (${durationText})`;
    } else {
      changeDescription = `Driver change: ${driverName} (${durationText})`;
    }
  } else {
    // Filtering by driver - showing truck changes
    const newTruck = tenure.entityName || 'Unassigned';
    if (tenure.oldEntityName && tenure.oldEntityName !== newTruck) {
      changeDescription = `Truck change to ${newTruck} from ${tenure.oldEntityName}`;
    } else {
      changeDescription = `Truck: ${newTruck} (${duration})`;
    }
  }
  
  return {
    _isHistoryEntry: true,
    _historyId: `${tenure.startDate}-${tenure.entityId || 'none'}`,
    _historyDate: tenure.startDate,
    _historyDateDisplay: tenure.startDate ? format(new Date(tenure.startDate + 'T12:00:00'), 'MM/dd/yyyy') : '',
    _changeDescription: changeDescription,
    _reason: tenure.endReason,
    _changedAt: tenure.startDate,
    _changedByName: tenure.changedByName,
    deliveryDate: tenure.startDate,
    _entityType: filterInfo.filterType === 'truck' ? 'driver' : 'truck',
    _entityName: tenure.entityName,
    _entityId: tenure.entityId,
  };
});
```

**Pass assignmentDate to NestedDriverTripsInlineContent (around line 4823)**

Add the new prop:

```tsx
<NestedDriverTripsInlineContent
  driverName={order._entityName}
  driverId={order._entityId}
  assignmentDate={order._historyDate}  // NEW PROP
  onSearchDriver={(name) => {
    setSearchFilter(name);
    setCurrentPage(1);
    toggleNestedTrips(historyKey);
  }}
  onEditOrder={(orderId) => {
    localStorage.setItem("returnToTrips", "true");
    navigate(`/edit-order/${orderId}`);
  }}
  onOrderPaidToggle={handleOrderPaidToggle}
  colSpan={totalColSpan}
  showMoveColumn={canMoveLoads}
  showPaidColumn={canSeePaidColumn}
/>
```

---

## Expected Results

| Requirement | Before | After |
|-------------|--------|-------|
| Trip filtering | Shows all trips for driver | Only shows trips with delivery date <= assignment date |
| Truck filter text | "Driver: Courtney Harris (Current - 1 week)" | "Driver change: Courtney Harris, switched from truck 241137 (current-1 week)" |
| Driver filter text | "Truck: 2415 (1 week)" | "Truck change to 2415 from 241137" |
| Short assignments | All assignments shown | Assignments <= 1 day filtered out |
| Table header border | Thick black border | Subtle single bottom border |

---

## Files Modified

1. `src/utils/tenureCalculator.ts` - Add oldEntityId/oldEntityName to Tenure interface and helper function
2. `src/components/NestedDriverTripsDropdown.tsx` - Add assignmentDate prop, filter logic, remove black border
3. `src/pages/Trips.tsx` - Add duration filter, update description format, pass assignmentDate prop
