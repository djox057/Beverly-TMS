
# Billboard Page: Optimize Data Loading with 30-Day Filter

## Problem Summary
The Billboard page currently uses `useOrders()` which fetches all orders via two Edge Functions:
- `get-all-unlocked-orders`: Fetches ALL unlocked orders (works correctly with batching)
- `get-all-locked-orders`: Only fetches **100 locked orders** by default (bug - missing batching loop)

With ~11,700+ locked orders, most dispatchers' historical data is missing, causing incomplete statistics.

## Solution: Create Dedicated Billboard Edge Function

Instead of fixing the existing functions to load all ~12,000 orders, we'll create a new optimized Edge Function specifically for Billboard that:
1. Filters orders at the database level to only include those with **delivery_datetime in the last 30 days**
2. Fetches both locked AND unlocked orders in a single request
3. Uses batched fetching to ensure all matching orders are retrieved

This approach:
- Reduces data transfer from ~12,000 orders to ~1,500-2,000 orders
- Ensures complete data for all dispatchers within the 30-day window
- Faster load times (~2-3 seconds vs 10+ seconds)

---

## Implementation Details

### Task 1: Create New Edge Function `get-billboard-orders`

**New file**: `supabase/functions/get-billboard-orders/index.ts`

This function will:
- Calculate the 30-day cutoff date server-side
- Query orders where `delivery_datetime >= 30 days ago`
- Fetch both locked and unlocked orders (no filter on locked status)
- Use batched fetching (1000 orders per batch) with a while loop
- Include all related data (pickup_drops, order_files, order_transfers, etc.)

Key query logic:
```text
const thirtyDaysAgo = new Date();
thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
const cutoffDate = thirtyDaysAgo.toISOString();

// Query with delivery_datetime filter
query = supabase
  .from("orders")
  .select(`...all relations...`)
  .gte("delivery_datetime", cutoffDate)
  .order("delivery_datetime", { ascending: false });
```

### Task 2: Update Supabase Config

**File**: `supabase/config.toml`

Add the new function configuration:
```toml
[functions.get-billboard-orders]
verify_jwt = false
```

### Task 3: Create Custom Hook `useBillboardOrders`

**New file**: `src/hooks/useBillboardOrders.ts`

This hook will:
- Call the new `get-billboard-orders` Edge Function
- Transform the response using existing `transformOrders` utility
- Return orders, loading state, and error handling

```text
export const useBillboardOrders = () => {
  return useQuery({
    queryKey: ["orders", "billboard"],
    queryFn: async () => {
      const response = await supabase.functions.invoke("get-billboard-orders");
      if (response.error) throw response.error;
      return transformOrders(response.data.orders || []);
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
};
```

### Task 4: Update Billboard Page

**File**: `src/pages/Billboard.tsx`

Change the import and hook usage:
```text
// Before:
import { useOrders } from "@/hooks/useOrders";
const { orders, isLoading } = useOrders();

// After:
import { useBillboardOrders } from "@/hooks/useBillboardOrders";
const { orders, isLoading } = useBillboardOrders();
```

---

## Additional Updates (From Previous Request)

While implementing the 30-day filter, we'll also address the previous requirements:

### Pages 7 and 8 Ranking Display

Change worst performer rankings to show actual position in the full list:

**Current**: Ranks displayed as 1, 2, 3, 4, 5
**Updated**: Ranks displayed as (total - 4) through (total) (e.g., 50, 51, 52, 53, 54)

```text
// Line ~401-403 in Billboard.tsx
case "worstRpm5":
  return { 
    list: worst5ByRPM, 
    title: "Worst 5 Dispatchers by RPM This Week (3+ trucks)", 
    startRank: Math.max(1, worstByRPM.length - 4)  // Changed from 1
  };
case "worstMonthlyRpm5":
  return { 
    list: worst5MonthlyRPM, 
    title: `Worst 5 Dispatchers by RPM - ${monthLabel} (3+ trucks)`, 
    startRank: Math.max(1, worstMonthlyByRPM.length - 4)  // Changed from 1
  };
```

### Truck Filter Threshold

Change worst RPM filter from 4.8+ trucks to 3+ trucks:

```text
// Lines ~195 and ~339
// Before:
const qualified = [...dispatcherStats].filter((d) => d.avgTrucks >= 4.8 && d.totalMiles > 0);

// After:
const qualified = [...dispatcherStats].filter((d) => d.avgTrucks >= 3 && d.totalMiles > 0);
```

### Update Title Text

Update "(5+ trucks)" to "(3+ trucks)" in the title strings for worst views.

---

## Files Changed Summary

| File | Action |
|------|--------|
| `supabase/functions/get-billboard-orders/index.ts` | Create new Edge Function |
| `supabase/config.toml` | Add function config |
| `src/hooks/useBillboardOrders.ts` | Create new hook |
| `src/pages/Billboard.tsx` | Update hook import, fix truck filter to 3+, fix worst rankings |

---

## Expected Results

After implementation:
1. Billboard loads only orders from last 30 days (~1,500-2,000 orders instead of 12,000+)
2. All dispatchers with activity in the last 30 days will have complete data
3. Pages 7 and 8 show actual rank positions (50-54 instead of 1-5)
4. Worst RPM views filter for dispatchers with 3+ average trucks
5. Significantly faster page load time

