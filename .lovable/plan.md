

## Fix: Yard/Recovery Loads Not Appearing in Trips Search by Truck# or Driver Name

### Problem
When searching by truck number or driver name on the Trips page, recovery (yard transfer) loads are missing because:

1. **Database query is incomplete**: The `searchByTruckOrDriver` function in `useTripsLazyOrders.ts` only queries `truck_id`, `driver1_id`, and `driver2_id`. It does not check `original_truck_id`, `original_driver1_id`, `original_driver2_id`, or drivers/trucks in the `order_transfers` table.

2. **Client-side filter excludes recovery segments**: After recovery loads are expanded into multiple segments (Orig/Rec), the client-side filter in `Trips.tsx` checks each segment's `truckNumber` and `driverName` independently. A "Rec" segment with a different truck/driver gets filtered out even though it belongs to the same load.

### Solution

#### 1. Expand database query conditions (`src/hooks/useTripsLazyOrders.ts`)

In the `searchByTruckOrDriver` function, add `original_truck_id`, `original_driver1_id`, and `original_driver2_id` to the OR conditions so that recovery loads are fetched when searching by the original equipment.

Also query `order_transfers` table for matching `truck_id` or `driver1_id` to find loads where a transfer segment uses the searched truck/driver, and include those order IDs.

#### 2. Fix client-side filtering to keep all segments of a matching load (`src/pages/Trips.tsx`)

Update the `filteredOrders` logic so that when any segment of a recovery load matches the search, all segments of that load are included. This will be done by:
- First, collecting all base order IDs that have at least one matching segment
- Then, including all segments that share one of those matching order IDs

### Technical Details

**File: `src/hooks/useTripsLazyOrders.ts`** -- `searchByTruckOrDriver` function

Add these additional OR conditions:
```
original_truck_id.in.(truckIds)
original_driver1_id.in.(driverIds)
original_driver2_id.in.(driverIds)
```

Also query `order_transfers` for matching truck/driver IDs and merge those order IDs into the results.

**File: `src/pages/Trips.tsx`** -- `filteredOrders` block (~line 982)

Change the filter to a two-pass approach:
1. Pass 1: Find all base order IDs where any expanded segment matches the search criteria
2. Pass 2: Include all segments whose base order ID is in the matched set

This ensures that when searching "5870", both the "Orig" segment (truck 5870) and the "Rec" segment (different truck) appear together.

