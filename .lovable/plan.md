

# Plan: Fix Fleet Averages Calculation and Add Rescheduled Lost Days

## Summary

The current calculation for **# Trucks** and **# Drivers** is incorrect because:

1. **Per-dispatcher average**: Currently divides by `daysCount` (days WITH data), but should divide by **total days in range** (treating missing days as 0)
2. **Fleet total**: Currently sums averages incorrectly

### Example (Jan 25-27, 3 days):
| Dispatcher | Current Logic | Correct Logic |
|------------|---------------|---------------|
| Danica (1 day of data, 3 trucks) | 3 / 1 = **3.0** avg | (3+0+0) / 3 = **1.0** avg |
| Adonis (3 days of data, 6 each) | 18 / 3 = **6.0** avg | (6+6+6) / 3 = **6.0** avg |

The fleet total should sum these corrected individual averages.

---

## Implementation

### Part 1: Fix Average Calculation in `fetchDriverCounts` Effect

**File:** `src/pages/Analytics.tsx`

**Current Logic (lines 381-391):**
```typescript
countsMap[record.dispatcher_id].totalTrucks += record.truck_count ?? record.driver_count ?? 0;
countsMap[record.dispatcher_id].daysCount += 1;
// Then later: avgTrucks = totalTrucks / daysCount
```

**New Logic:**
1. Store the total days in the date range alongside each dispatcher's data
2. Calculate average using total range days, not just days with data

```typescript
// Calculate total days in the range
const startDate = new Date(fromDate);
const endDate = new Date(toDate);
const totalDaysInRange = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;

// Store with totalDaysInRange for correct averaging
const countsMap: Record<string, { 
  totalTrucks: number; 
  totalDrivers: number; 
  daysWithData: number;
  totalDaysInRange: number;  // NEW: total days for correct averaging
}> = {};

allRecords.forEach((record: any) => {
  if (!countsMap[record.dispatcher_id]) {
    countsMap[record.dispatcher_id] = { 
      totalTrucks: 0, 
      totalDrivers: 0, 
      daysWithData: 0,
      totalDaysInRange 
    };
  }
  countsMap[record.dispatcher_id].totalTrucks += record.truck_count ?? record.driver_count ?? 0;
  countsMap[record.dispatcher_id].totalDrivers += record.driver_count ?? 0;
  countsMap[record.dispatcher_id].daysWithData += 1;
});
```

### Part 2: Fix `dispatcherStats` Average Calculation

**File:** `src/pages/Analytics.tsx` (lines 1118-1119)

**Current:**
```typescript
const avgTrucks = truckCountData ? truckCountData.totalTrucks / truckCountData.daysCount : 0;
```

**New:**
```typescript
// Divide by totalDaysInRange instead of daysWithData
const avgTrucks = truckCountData 
  ? truckCountData.totalTrucks / truckCountData.totalDaysInRange 
  : 0;
```

### Part 3: Fix Fleet Totals in `fleetAverages` Memo

**File:** `src/pages/Analytics.tsx` (lines 1281-1288)

**Current:**
```typescript
dispatchersInScope.forEach(([_, counts]) => {
  if (counts.daysCount > 0) {
    totalTruckDays += counts.totalTrucks;
    totalAvgTrucks += counts.totalTrucks / counts.daysCount;
  }
});
```

**New:**
```typescript
dispatchersInScope.forEach(([_, counts]) => {
  // Sum of all truck-days (for Coverage calculation)
  totalTruckDays += counts.totalTrucks;
  
  // Average per dispatcher = totalTrucks / totalDaysInRange
  // (missing days treated as 0)
  const avgForThisDispatcher = counts.totalTrucks / counts.totalDaysInRange;
  totalAvgTrucks += avgForThisDispatcher;
  totalAvgDrivers += counts.totalDrivers / counts.totalDaysInRange;
});
```

---

## Part 4: Add Rescheduled Orders to Lost Days

### Current `date_change_notes` Format:
```
Supposed to deliver on 01/26/2026
```

### Calculation Logic:
For each order with `date_change_notes`:
1. Parse the original date from the notes
2. Get the final `delivery_datetime`
3. Calculate days between original and actual delivery
4. Each day = 1 lost day for that driver

### Code Changes to `fetchFleetLostDays`:

**Step 1: Add helper function**
```typescript
const parseRescheduledDates = (notes: string): string[] => {
  const regex = /Supposed to deliver on (\d{2}\/\d{2}\/\d{4})/g;
  const dates: string[] = [];
  let match;
  while ((match = regex.exec(notes)) !== null) {
    const [month, day, year] = match[1].split('/');
    dates.push(`${year}-${month}-${day}`);
  }
  return dates;
};
```

**Step 2: Query rescheduled orders**
```typescript
const { data: rescheduledOrders } = await supabase
  .from("orders")
  .select("id, driver1_id, date_change_notes, delivery_datetime")
  .not("date_change_notes", "is", null)
  .neq("date_change_notes", "");
```

**Step 3: Calculate lost days from reschedules**
```typescript
const rescheduledLostDays = new Set<string>();

rescheduledOrders?.forEach((order) => {
  if (!order.date_change_notes || !order.delivery_datetime || !order.driver1_id) return;
  
  const originalDates = parseRescheduledDates(order.date_change_notes);
  const actualDate = order.delivery_datetime.split('T')[0]; // YYYY-MM-DD
  
  originalDates.forEach((origDate) => {
    // Only count if original date is before actual delivery
    if (origDate >= actualDate) return;
    
    // Add each day from original to actual (exclusive of actual)
    let currentDate = origDate;
    while (currentDate < actualDate) {
      if (currentDate >= fromDate && currentDate <= toDate) {
        rescheduledLostDays.add(`${order.driver1_id}-${currentDate}`);
      }
      // Increment date
      const d = new Date(currentDate);
      d.setDate(d.getDate() + 1);
      currentDate = d.toISOString().split('T')[0];
    }
  });
});
```

**Step 4: Combine sources**
```typescript
const allLostDays = new Set([
  ...lostDayNotesKeys,
  ...rescheduledLostDays
]);
setFleetLostDays(allLostDays.size);
```

---

## Updated Data Flow

```text
Date Range Selection (e.g., Jan 25-27 = 3 days)
    │
    └─► fetchDriverCounts
            │
            ├─► For each dispatcher:
            │       totalTrucks = sum of truck_count records
            │       totalDaysInRange = 3 (full range)
            │       avgTrucks = totalTrucks / 3 (NOT / daysWithData)
            │
            └─► Store in dispatcherTruckCounts

dispatcherStats:
    │
    └─► Each row's "Avg Trucks" = totalTrucks / totalDaysInRange

fleetAverages:
    │
    ├─► # Trucks = SUM of all dispatcher avgTrucks
    │
    ├─► # Drivers = SUM of all dispatcher avgDrivers
    │
    └─► Coverage% = (totalTruckDays - lostDays) / totalTruckDays

lostDays:
    │
    ├─► lost_day_notes table
    │
    └─► rescheduled orders (days between original and actual delivery)
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/pages/Analytics.tsx` | Update `fetchDriverCounts` to store `totalDaysInRange`, update `dispatcherStats` average calculation, update `fleetAverages` to sum corrected averages, add rescheduled orders parsing to `fetchFleetLostDays` |

