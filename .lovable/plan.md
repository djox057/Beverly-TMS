

## Problem Analysis

The "Next Orders" feature in the Beverly Heatmap is answering the wrong question.

### How It Works Now (Incorrect)

The heatmap clusters ALL stops (pickups AND deliveries) within 60 miles of a city. For Houston, this means orders that either pick up OR deliver near Houston are all in the `order_ids` list. Then for EVERY order in that list, it finds the driver's chronologically next order -- regardless of where that next order picks up.

**Example with driver Donald Moisant last week:**

| # | Load | Pickup City | Delivery City | In Houston Cluster? |
|---|------|------------|---------------|-------------------|
| 1 | 0172171 | Shreveport, LA | Porter, TX (near Houston) | Yes (delivery stop) |
| 2 | 15739071 | La Porte, TX (near Houston) | Sioux Falls, SD | Yes (pickup stop) |
| 3 | 5042742 | Sioux City, IA | Jefferson, GA | No |

Current logic treats both orders 0172171 and 15739071 as "Houston orders" and finds:
- Next after 0172171 = 15739071 (La Porte pickup -- this is correct, truck leaves Houston area)
- Next after 15739071 = **5042742** (Sioux City, IA pickup -- WRONG, this isn't "from Houston")

Load 5042742 appears in Houston's "next orders" even though it picks up 1,200 miles away in Iowa.

### How It Should Work (Correct)

"Next orders from Houston" should only include orders where the driver **DELIVERS** to the Houston area and then the **next load picks up from** the Houston area. This answers: "When a truck arrives in Houston, what load does it take out?"

Using the same example:
- Order 0172171 delivers to Porter, TX (near Houston) -- qualifies as a "delivery to Houston"
- Its next order 15739071 picks up from La Porte, TX (near Houston) -- this IS a valid "next from Houston"
- Order 15739071 picks up FROM Houston (not delivers TO Houston) -- should NOT be used as a base for "next order" lookup

So only load 15739071 should appear as a "next order" for Houston (not 5042742).

### Implementation Plan

**Step 1: Identify delivery-only orders per cluster**

In the `nextOrderMap` query function (BeverlyHeatmap.tsx ~line 245), after fetching heatmap orders and their stops:

1. Fetch `pickup_drops` for all `allOrderIds` to get each stop's type (pickup vs delivery) and coordinates
2. For each city cluster, filter `orderIds` to keep only orders that have a **delivery** stop within 60 miles of the cluster city coordinates (using the `city_lat`/`city_lng` from `heatmap_city_counts`)

**Step 2: Find next pickup-from-area orders**

For each delivery-to-cluster order, find the driver's next order and verify it picks up from the same cluster area (within 60 miles). Only include it in the financial aggregation if it does.

**Step 3: Update aggregation**

In Step 5 of the query, iterate only over delivery-filtered order IDs (not all cluster order IDs) and only count next orders whose pickup is near the cluster city.

### Technical Details

**Files to modify:** `src/pages/BeverlyHeatmap.tsx`

**Changes in the `nextOrderMap` query function:**

1. Add a fetch of `pickup_drops` (type, latitude, longitude) for all `allOrderIds` -- needed to determine which are deliveries to the cluster
2. Store cluster city coordinates (already available in `baseCities` but need `city_lat`/`city_lng` from `rawData`) -- extend `CityAgg` type to include lat/lng
3. Add a haversine helper function (client-side, same formula as edge function) to check if a stop is within 60 miles
4. For each city in Step 5:
   - Filter `cityAgg.orderIds` to only orders with a delivery stop within 60 miles of the city center
   - For each of those, get the driver's next order
   - Fetch pickup stops for those next orders and verify the pickup is also within 60 miles of the city
   - Only include verified next orders in freight/miles/count aggregation
5. Update `deliveryTotal` to reflect the delivery-filtered count

**Data flow:**
```text
heatmap_city_counts (order_ids per cluster)
  |
  v
Filter to orders with DELIVERY stop near cluster city
  |
  v
Find each driver's next chronological order
  |
  v
Verify next order has PICKUP stop near cluster city
  |
  v
Aggregate freight/miles/RPM from verified next orders
```

**Additional queries needed:**
- Fetch `pickup_drops` for all heatmap order IDs (already done in a previous version of the code, just add back with lat/lng and type)
- Fetch `pickup_drops` for next-order candidates to verify pickup location

**Edge cases:**
- Orders with multiple delivery stops: use the one closest to the cluster city
- Next order has no pickup_drops with coordinates: exclude from aggregation
- Same order appears in multiple clusters: handled independently per cluster
