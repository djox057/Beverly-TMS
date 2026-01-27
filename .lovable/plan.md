

# Fix Reports Page to Display Drivers Without Trucks

## Problem Summary
The `/reports` page is not displaying active drivers who don't have a truck assigned. For example, driver "Raymond Ortiz" (ID: `380bfdf3-744c-4be3-a61a-8514849b5c35`) is:
- Active (`is_active: true`)
- Has a dispatcher assigned (`dispatcher_id: 069b0875-5702-4da8-b476-e4c315463626`)
- But has NO truck assigned (not in the `trucks` table as `driver1_id` or `driver2_id`)

The legacy `useReports.ts` hook (lines 1934-1936) explicitly handled this by fetching all active drivers and identifying "unassigned drivers" who aren't linked to any truck. This logic was omitted during the migration to the date-window architecture.

## Root Cause
In `src/hooks/useReportsDateWindow.ts`, the function `fetchDriverIdsForOffice` (lines 364-427) only collects driver IDs via the truck-centric path:
1. Get dispatchers in the office
2. Fetch active trucks with their `driver1` relationship
3. Filter trucks where `driver1.dispatcher_id` is in the office
4. Return only those driver IDs

This completely misses active drivers with a matching `dispatcher_id` who are not currently assigned to any truck.

## Solution

### Step 1: Update `fetchDriverIdsForOffice` in `useReportsDateWindow.ts`
Extend the function to also fetch active drivers directly by their `dispatcher_id`, not just through truck assignments.

```text
                          ┌────────────────────┐
                          │  fetchDriverIds    │
                          │    ForOffice       │
                          └────────────────────┘
                                   │
                    ┌──────────────┴──────────────┐
                    ▼                              ▼
         ┌──────────────────┐           ┌──────────────────┐
         │  Path A: Trucks  │           │  Path B: Drivers │
         │  (existing)      │           │  (NEW)           │
         └──────────────────┘           └──────────────────┘
                    │                              │
         Get driver IDs from          Get driver IDs directly
         active trucks where          from drivers table where
         driver1.dispatcher_id        dispatcher_id matches
         matches office               office dispatcher list
                    │                              │
                    └──────────────┬───────────────┘
                                   ▼
                          ┌────────────────────┐
                          │ Merge + Deduplicate│
                          │    driver IDs      │
                          └────────────────────┘
```

Changes to make:
- After the existing truck-based driver ID collection, add a second query to fetch active drivers directly by `dispatcher_id`
- Use `supabase.from("drivers").select("id").eq("is_active", true).in("dispatcher_id", filterDispatcherIds)`
- Merge both sets of driver IDs (truck-based + direct) into one unique set

### Step 2: Update Adapter to Handle Drivers Without Trucks
In `src/hooks/useReportsDateWindowAdapter.ts`, the transformation logic already partially handles this (line 685: `id: truck?.id || 'driver-${driverId}'`), but there are additional changes needed:

- When fetching trucks (line 175-188), the query filters by driver IDs in scope, which will now include unassigned drivers
- For unassigned drivers, `truckByDriverId.get(driverId)` returns `undefined`, which is already handled
- Ensure the adapter correctly generates report entries for drivers without trucks (no truck number, but driver info is displayed)

### Step 3: Update Adapter Trucks Query
The adapter fetches trucks filtered by `driverIdsForScope` (line 182). This works correctly since unassigned drivers simply won't have matching trucks, and the code already handles `truck` being undefined (line 687: `truckNumber: truck?.truck_number || null`).

## Files to Modify

### 1. `src/hooks/useReportsDateWindow.ts`
**Location**: `fetchDriverIdsForOffice` function (lines 364-427)

**Changes**:
- Add a second query after the truck-based collection to fetch active drivers directly by dispatcher_id
- Merge the results into the final `driverIds` array

### 2. `src/hooks/useReportsDateWindowAdapter.ts`
**Location**: Adapter trucks query and transformation logic

**Changes**:
- Update the adapter's drivers query to not filter by `driverIdsForScope` since we now want ALL active drivers for the office dispatchers (or expand the scope appropriately)
- Verify the transformation handles unassigned drivers correctly

## Technical Details

### Updated `fetchDriverIdsForOffice` Logic (pseudocode):

```
async function fetchDriverIdsForOffice(priorityOffice):
  // Step 1: Get dispatchers in this office
  dispatchers = await supabase.from("profiles").select(...)
  filterDispatcherIds = dispatchers.filter(office matches).map(user_id)
  
  // Step 2: Fetch drivers from trucks (existing logic)
  trucks = await supabase.from("trucks").select(... driver1 relation)
  for each truck:
    if driver1.dispatcher_id in filterDispatcherIds:
      add driver1.id and driver2_id to driverIdsSet
  
  // Step 3: NEW - Fetch active drivers directly by dispatcher_id
  unassignedDrivers = await supabase
    .from("drivers")
    .select("id")
    .eq("is_active", true)
    .in("dispatcher_id", filterDispatcherIds)
  
  for each driver in unassignedDrivers:
    add driver.id to driverIdsSet  // Set handles deduplication
  
  return { driverIds: Array.from(driverIdsSet), dispatcherIds }
```

### Matching Legacy Behavior
This approach directly matches `useReports.ts` lines 1913-1936:
1. Legacy hook fetches all active drivers filtered by dispatcher_id (line 1924)
2. Legacy hook identifies unassigned drivers (line 1936)
3. Legacy hook creates report entries for unassigned drivers (lines 1946-2215)

## Testing Checklist
1. After the fix, verify Raymond Ortiz appears in the Reports page under his dispatcher
2. Verify unassigned drivers show "—" for truck number but display driver name correctly
3. Verify drivers assigned to trucks still display correctly
4. Verify switching office tabs correctly shows/hides drivers based on their dispatcher's office
5. Verify no duplicate entries for drivers (the Set deduplication handles this)
6. Verify orders for unassigned drivers display correctly in the calendar view

