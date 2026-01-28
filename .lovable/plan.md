
# Analytics Page: Add Fleet Averages Row

## Overview
Add a new summary row below the existing "Total Freight / Total Miles / Avg Rate/Mile / Total Comm. / Comm. %" section that displays fleet-level average metrics and usage percentage.

## New Metrics to Display

| Metric | Calculation | Description |
|--------|-------------|-------------|
| Avg Gross/Truck | `totalFreight / uniqueTruckCount` | Average gross revenue per truck |
| Avg Miles/Truck | `totalMiles / uniqueTruckCount` | Average miles driven per truck |
| Avg # Trucks | Count of unique `truckId` values in filtered orders | Average active trucks |
| Avg # Drivers | Count of unique driver IDs in filtered orders | Average active drivers |
| Usage % | `100 - (lostDays / totalPossibleDays × 100)` | Fleet utilization rate |

## Technical Implementation

### 1. Calculate Unique Truck and Driver Counts

**File:** `src/pages/Analytics.tsx`

Add a new `useMemo` after the existing `totals` calculation (around line 1223):

```typescript
// Calculate fleet averages from filtered orders
const fleetAverages = useMemo(() => {
  // Get unique trucks (excluding null/undefined)
  const uniqueTruckIds = new Set(
    filteredOrders
      .map((order) => order.truckId)
      .filter((id) => id && id !== "null")
  );
  
  // Get unique drivers (combining driver1 and driver2)
  const uniqueDriverIds = new Set(
    filteredOrders.flatMap((order) => [order.driver1Id, order.driver2Id])
      .filter((id) => id && id !== "null")
  );
  
  const truckCount = uniqueTruckIds.size;
  const driverCount = uniqueDriverIds.size;
  
  return {
    truckCount,
    driverCount,
    avgGrossPerTruck: truckCount > 0 ? totals.totalFreight / truckCount : 0,
    avgMilesPerTruck: truckCount > 0 ? totals.totalMiles / truckCount : 0,
    // Store unique IDs for lost days query
    uniqueDriverIds: Array.from(uniqueDriverIds),
  };
}, [filteredOrders, totals]);
```

### 2. Fetch Lost Days for Usage% Calculation

**File:** `src/pages/Analytics.tsx`

Add a new state and effect to fetch lost days from `lost_day_notes` table:

```typescript
// State for lost days count
const [fleetLostDays, setFleetLostDays] = useState<number>(0);

// Effect to fetch lost days within date range for drivers in filtered orders
useEffect(() => {
  const fetchFleetLostDays = async () => {
    if (!dateRange?.from || fleetAverages.uniqueDriverIds.length === 0) {
      setFleetLostDays(0);
      return;
    }
    
    const fromDate = format(dateRange.from, "yyyy-MM-dd");
    const toDate = dateRange.to ? format(dateRange.to, "yyyy-MM-dd") : fromDate;
    
    // Fetch lost days (excluding "Home Time" notes which are intentional)
    const { data, error } = await supabase
      .from("lost_day_notes")
      .select("id, driver_id, date")
      .in("driver_id", fleetAverages.uniqueDriverIds)
      .gte("date", fromDate)
      .lte("date", toDate)
      .not("note_type", "eq", "home_time"); // Exclude home time
    
    if (error) {
      console.error("Error fetching fleet lost days:", error);
      return;
    }
    
    // Count unique driver-date combinations
    const uniqueLostDays = new Set(
      (data || []).map((d) => `${d.driver_id}-${d.date}`)
    );
    
    setFleetLostDays(uniqueLostDays.size);
  };
  
  fetchFleetLostDays();
}, [dateRange, fleetAverages.uniqueDriverIds]);
```

### 3. Calculate Usage Percentage

```typescript
// Calculate Usage% 
const usagePercent = useMemo(() => {
  if (!dateRange?.from || fleetAverages.driverCount === 0) return 100;
  
  // Calculate total possible days (calendar days × driver count)
  const startDate = dateRange.from;
  const endDate = dateRange.to || dateRange.from;
  const daysDiff = Math.ceil(
    (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
  ) + 1;
  
  const totalPossibleDays = daysDiff * fleetAverages.driverCount;
  
  if (totalPossibleDays === 0) return 100;
  
  // Usage% = 100 - (lostDays / totalPossibleDays × 100)
  const lostPercentage = (fleetLostDays / totalPossibleDays) * 100;
  return Math.max(0, 100 - lostPercentage);
}, [dateRange, fleetAverages.driverCount, fleetLostDays]);
```

### 4. Update UI - Add New Row

**File:** `src/pages/Analytics.tsx`

Add a new row after the existing totals section (after line ~1898):

```typescript
{/* Fleet Averages Section - New Row */}
<div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4 sm:gap-8 mt-4 pt-4 border-t border-border">
  <div className="text-center">
    <p className="text-xs sm:text-sm font-medium text-muted-foreground mb-1">Avg Gross/Truck</p>
    <p className="text-lg sm:text-2xl font-bold text-blue-600 dark:text-blue-400">
      ${fleetAverages.avgGrossPerTruck.toLocaleString(undefined, {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })}
    </p>
  </div>
  <div className="text-center">
    <p className="text-xs sm:text-sm font-medium text-muted-foreground mb-1">Avg Miles/Truck</p>
    <p className="text-lg sm:text-2xl font-bold">
      {fleetAverages.avgMilesPerTruck.toLocaleString(undefined, {
        maximumFractionDigits: 0,
      })}
    </p>
  </div>
  <div className="text-center">
    <p className="text-xs sm:text-sm font-medium text-muted-foreground mb-1">Avg # Trucks</p>
    <p className="text-lg sm:text-2xl font-bold">{fleetAverages.truckCount}</p>
  </div>
  <div className="text-center">
    <p className="text-xs sm:text-sm font-medium text-muted-foreground mb-1">Avg # Drivers</p>
    <p className="text-lg sm:text-2xl font-bold">{fleetAverages.driverCount}</p>
  </div>
  <div className="text-center col-span-2 sm:col-span-1">
    <p className="text-xs sm:text-sm font-medium text-muted-foreground mb-1">Usage %</p>
    <p className={`text-lg sm:text-2xl font-bold ${
      usagePercent >= 90 ? 'text-green-600 dark:text-green-400' :
      usagePercent >= 75 ? 'text-yellow-600 dark:text-yellow-400' :
      'text-red-600 dark:text-red-400'
    }`}>
      {usagePercent.toFixed(1)}%
    </p>
  </div>
</div>
```

## Files to Modify

| File | Changes |
|------|---------|
| `src/pages/Analytics.tsx` | Add fleetAverages useMemo, fleetLostDays state/effect, usagePercent calculation, new UI row |

## Data Flow

```text
filteredOrders
    │
    ├─► Extract unique truckIds ─► truckCount
    │
    ├─► Extract unique driver1Id + driver2Id ─► driverCount
    │
    ├─► totals.totalFreight / truckCount ─► avgGrossPerTruck
    │
    ├─► totals.totalMiles / truckCount ─► avgMilesPerTruck
    │
    └─► Fetch lost_day_notes for drivers in date range
            │
            ├─► Count unique driver-date lost days
            │
            └─► 100 - (lostDays / (daysDiff × driverCount) × 100) ─► usagePercent
```

## Edge Cases

1. **No date range selected**: Show totals based on all time data, Usage% defaults to 100%
2. **No orders in filter**: All values show 0 or dash
3. **No lost days data**: Usage% shows 100%
4. **Office filter applied**: Only trucks/drivers from filtered orders are counted

## Visual Design

- New row appears below the existing summary row with a subtle border separator
- Color coding for Usage%:
  - Green (≥90%): Good utilization
  - Yellow (75-89%): Moderate utilization  
  - Red (<75%): Low utilization
- Consistent styling with existing summary metrics
