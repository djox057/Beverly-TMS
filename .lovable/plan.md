

## Root Cause Analysis

The duplicate internal load numbers are caused by **EditOrder.tsx updating `company_id`** when saving an order.

### How it happens:

1. **Order created**: Driver belongs to AP Silver → RPC gets `company_id = AP Silver` → suffix "AP" → counts AP Silver orders → assigns `12749-AP`
2. **Order edited**: The truck or driver is reassigned to a BF Prime United truck/driver → EditOrder.tsx line 2421 overwrites `company_id` to BF Prime United
3. **New order created**: Next AP Silver order → RPC counts AP Silver orders → the moved order is no longer counted → `12749-AP` gets reissued

The ironic part: the comment on line 2419 says *"Internal load number is frozen at creation — never reassigned"* but the very next line updates `company_id`, which breaks the uniqueness of the counter.

### Evidence:
- All duplicate pairs have one order originally from AP Silver whose `company_id` was later changed to BF Prime United (all with `booked_by_company_id = BF Prime LLC`)
- The driver on the "BF Prime United" order (e.g., KIARA THOMAS) actually belongs to AP Silver, confirming the order was originally AP Silver
- The pattern is consistent across dozens of duplicates

---

## Fix Plan

### 1. Stop updating `company_id` in EditOrder.tsx
**File**: `src/pages/EditOrder.tsx` (lines 2419-2422)

Remove the block that overwrites `company_id` with the current truck/driver's company. The `company_id` should be frozen at creation time, just like the internal load number.

### 2. Add a unique constraint to prevent future duplicates
**Database migration**: Add a unique index on `internal_load_number` to catch any edge cases at the database level:
```sql
CREATE UNIQUE INDEX IF NOT EXISTS orders_internal_load_number_unique 
ON orders (internal_load_number) 
WHERE internal_load_number IS NOT NULL;
```

### 3. Fix existing duplicate data
Run a one-time data fix to reassign correct `company_id` back to orders that were incorrectly moved — restoring them to the company that matches their suffix.

---

### Technical details

- **Lines to remove**: `src/pages/EditOrder.tsx` lines 2419-2422 (the `company_id` override)
- **Migration**: unique index on `internal_load_number` (prevents future duplicates at DB level)
- **Data fix**: Update orders where company name doesn't match suffix (e.g., BF Prime United orders with "-AP" suffix should have company_id = AP Silver)

