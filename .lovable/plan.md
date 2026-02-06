

# Database Performance Optimization

## Root Cause

Supabase support confirmed your database has been under sustained CPU and memory pressure. The polling reduction we already deployed helps, but the **core problem** is missing database indexes on the most critical query paths. Here's what the stats show:

- The `orders` table (12,679 rows) is doing **2,891 full table scans** reading 24 million rows total
- The `companies` table (7 rows) is being scanned **372,000 times** via nested loop joins
- There is **no index on `delivery_datetime`** or `locked` -- the two columns every Reports query filters on
- The `idx_orders_created_at` index reads **284 million tuples** per cycle, suggesting inefficient query plans

## Plan

### 1. Add Missing Indexes (Database Migration)

Create composite indexes that match the actual query patterns:

```text
-- Reports main query: WHERE locked = false AND delivery_datetime >= 90_days_ago
CREATE INDEX idx_orders_locked_delivery ON orders (locked, delivery_datetime DESC)
  WHERE NOT locked;

-- Yard Loads count: WHERE driver1_id IS NULL AND truck_id IS NULL
CREATE INDEX idx_orders_yard_loads ON orders (driver1_id, truck_id)
  WHERE driver1_id IS NULL AND truck_id IS NULL;

-- Order transfers lookup by driver
CREATE INDEX idx_order_transfers_driver1 ON order_transfers (driver1_id);
CREATE INDEX idx_order_transfers_driver2 ON order_transfers (driver2_id);
```

### 2. Drop Unused Indexes

These indexes have **zero scans** and waste disk I/O and write overhead:

```text
DROP INDEX idx_orders_original_delivery_datetime;
DROP INDEX idx_orders_invoiced_at;
DROP INDEX idx_orders_company_id;
DROP INDEX idx_pickup_drops_coordinates;
DROP INDEX idx_pickup_drops_datetime;
DROP INDEX idx_pickup_drops_type;
DROP INDEX idx_order_files_category;
```

### 3. Reduce `companies` Table Scan Storm

The `companies` table (7 rows) is scanned 372K times because every order join triggers a nested loop. A single-line optimization in the Reports query can cache company lookups instead of joining repeatedly. This is a code change in `useReports.ts` to pre-fetch companies and attach them in JavaScript instead of via the Supabase query join.

### Summary of Impact

| Change | Expected Impact |
|--------|----------------|
| Add `idx_orders_locked_delivery` | Reports query goes from full table scan to index scan |
| Add `idx_orders_yard_loads` | Yard loads count becomes near-instant |
| Add transfer driver indexes | Nested driver trip lookups use index instead of scan |
| Drop 7 unused indexes | Reduces write amplification and disk I/O |
| Company lookup optimization | Eliminates 372K/cycle nested loop joins |

### Technical Notes

- All index creation uses `CREATE INDEX CONCURRENTLY` (non-blocking) where possible
- The partial index `WHERE NOT locked` is optimal because Reports only queries unlocked orders
- The yard loads partial index is very small (only rows where both columns are NULL)
- Dropping unused indexes is safe -- `idx_scan = 0` confirms they've never been used since last stats reset
