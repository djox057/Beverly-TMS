
# Analytics: Fix Truck/Driver Counts Using Historical Daily Averages

## Problem Summary

The current Analytics page counts trucks and drivers by extracting unique IDs from filtered orders. This is **incorrect** because:
- Only trucks/drivers with orders are counted
- Idle trucks/drivers are excluded from averages
- This skews "Avg Gross/Truck" and "Avg Miles/Truck" calculations

## Current vs. Correct Behavior

| Metric | Current (Wrong) | Correct |
|--------|-----------------|---------|
| Avg # Trucks | Count unique truckIds in filtered orders | Average of daily truck counts from `dispatcher_daily_driver_counts` |
| Avg # Drivers | Count unique driverIds in filtered orders | Average of daily driver counts from `dispatcher_daily_driver_counts` |

**Example**: If dispatcher has 6 trucks but only 4 had loads this month:
- Current: Shows 4 trucks → Gross/Truck is inflated
- Correct: Shows 6 trucks → Accurate Gross/Truck

---

## Implementation Plan

### Step 1: Database Migration - Add `truck_count` Column

```sql
-- Add truck_count column (nullable initially for backfill)
ALTER TABLE dispatcher_daily_driver_counts 
ADD COLUMN truck_count integer;

-- Backfill: Copy driver_count to truck_count 
-- (current driver_count actually stores truck counts)
UPDATE dispatcher_daily_driver_counts 
SET truck_count = driver_count;

-- Make truck_count NOT NULL after backfill
ALTER TABLE dispatcher_daily_driver_counts 
ALTER COLUMN truck_count SET NOT NULL;

-- Add comment to clarify column meanings
COMMENT ON COLUMN dispatcher_daily_driver_counts.driver_count IS 'Number of active drivers assigned to this dispatcher on this date';
COMMENT ON COLUMN dispatcher_daily_driver_counts.truck_count IS 'Number of trucks assigned to drivers under this dispatcher on this date';
```

### Step 2: Update Edge Function to Record Both Counts

**File:** `supabase/functions/record-dispatcher-driver-counts/index.ts`

Current logic counts trucks but saves to `driver_count`. Update to:

```typescript
// Count trucks per dispatcher (existing logic)
const dispatcherTruckCounts = new Map<string, number>();
// ... existing truck counting logic ...

// NEW: Count drivers per dispatcher
const dispatcherDriverCounts = new Map<string, number>();
drivers?.forEach((driver) => {
  if (driver.dispatcher_id) {
    const current = dispatcherDriverCounts.get(driver.dispatcher_id) || 0;
    dispatcherDriverCounts.set(driver.dispatcher_id, current + 1);
  }
});

// Upsert with both counts
const { data, error } = await supabase
  .from('dispatcher_daily_driver_counts')
  .upsert({
    dispatcher_id: dispatcherId,
    date: today,
    truck_count: truckCount,        // actual truck count
    driver_count: driverCount,      // actual driver count
    updated_at: new Date().toISOString(),
  }, {
    onConflict: 'dispatcher_id,date',
  });
```

### Step 3: Update Analytics Page

**File:** `src/pages/Analytics.tsx`

#### 3a. Update state and fetch to include both counts

```typescript
// Update state type
const [dispatcherTruckCounts, setDispatcherTruckCounts] = useState<
  Record<string, { 
    totalTrucks: number; 
    totalDrivers: number; 
    daysCount: number 
  }>
>({});

// Update aggregation in fetchDriverCounts
countsMap[record.dispatcher_id].totalTrucks += record.truck_count;
countsMap[record.dispatcher_id].totalDrivers += record.driver_count;
countsMap[record.dispatcher_id].daysCount += 1;
```

#### 3b. Calculate fleet-wide averages from daily counts

```typescript
// Replace current fleetAverages useMemo with historical averages
const fleetAverages = useMemo(() => {
  // Get dispatchers in scope (filtered by office if applicable)
  const dispatchersInScope = Object.entries(dispatcherTruckCounts)
    .filter(([dispatcherId]) => {
      // If no office filter, include all
      if (selectedOffices.length === 0) return true;
      
      // Find dispatcher's office from profiles
      const profile = Object.values(dispatcherProfiles)
        .find(p => p.user_id === dispatcherId);
      return profile && selectedOffices.includes(profile.office || '');
    });

  // Sum up daily counts for dispatchers in scope
  let totalTruckDays = 0;
  let totalDriverDays = 0;
  let totalDays = 0;

  dispatchersInScope.forEach(([_, counts]) => {
    totalTruckDays += counts.totalTrucks;
    totalDriverDays += counts.totalDrivers;
    totalDays += counts.daysCount;
  });

  // Calculate averages
  const avgTrucks = totalDays > 0 ? totalTruckDays / totalDays : 0;
  const avgDrivers = totalDays > 0 ? totalDriverDays / totalDays : 0;

  return {
    truckCount: avgTrucks,
    driverCount: avgDrivers,
    avgGrossPerTruck: avgTrucks > 0 ? totals.totalFreight / avgTrucks : 0,
    avgMilesPerTruck: avgTrucks > 0 ? totals.totalMiles / avgTrucks : 0,
    // Keep uniqueDriverIds for lost_day_notes query (still needed from orders)
    uniqueDriverIds: Array.from(new Set(
      filteredOrders.flatMap((o) => [o.driver1Id, o.driver2Id]).filter(Boolean)
    )),
  };
}, [dispatcherTruckCounts, selectedOffices, dispatcherProfiles, totals, filteredOrders]);
```

---

## Data Flow Diagram

```text
Daily Cron Job (record-dispatcher-driver-counts)
    │
    ├─► Count trucks assigned to dispatcher's drivers ─► truck_count
    │
    └─► Count active drivers under dispatcher ─► driver_count
            │
            └─► Store in dispatcher_daily_driver_counts table

Analytics Page Load:
    │
    ├─► Fetch dispatcher_daily_driver_counts for date range
    │
    ├─► Filter by office (if selected)
    │
    ├─► SUM(truck_count) / days ─► avgTrucks
    │
    ├─► SUM(driver_count) / days ─► avgDrivers
    │
    ├─► totalFreight / avgTrucks ─► avgGrossPerTruck
    │
    └─► totalMiles / avgTrucks ─► avgMilesPerTruck
```

---

## Files to Modify

| File | Changes |
|------|---------|
| Database migration | Add `truck_count` column, backfill data |
| `supabase/functions/record-dispatcher-driver-counts/index.ts` | Record both truck_count and driver_count separately |
| `src/pages/Analytics.tsx` | Use daily averages from table instead of counting from orders |

---

## Technical Notes

### Why backfill truck_count = driver_count?

The current edge function counts trucks but stores in `driver_count`. After backfill:
- `truck_count` = historical truck counts (correct data)
- `driver_count` = same value initially (will be corrected going forward)

### Office Filtering

When user selects office(s) in Analytics:
- Filter `dispatcherTruckCounts` to only include dispatchers from those offices
- Sum their daily counts for fleet averages

### Edge Cases

1. **New dispatchers**: Will have daily records going forward
2. **Date range before data exists**: Show 0 or fallback to order-based count
3. **Dispatcher changes office**: Historical data stays with old office (correct behavior)

---

## Verification

After implementation, verify:
- [ ] Fleet summary shows daily-averaged truck/driver counts
- [ ] Office filter correctly filters dispatcher data
- [ ] Avg Gross/Truck uses correct average truck count
- [ ] Edge function records both truck_count and driver_count
- [ ] Historical data preserved via backfill
