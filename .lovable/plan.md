

## Plan: "Mark Complete" Button for Multi-Pickup/Drop BOL/POD

### Problem
Multi-pickup/drop orders sometimes receive only 1 BOL/POD file even though there are 3+ stops. The cell coloring logic checks file count vs stop count, making the order appear incomplete.

### Solution
Add a "Complete" button in the Document Status section of the load info dialog (Reports page) for BOL and POD on multi-stop orders where file count is less than stop count. Clicking it (after confirmation) will force-mark all stops as having documents.

### Database Changes
Add two boolean columns to the `orders` table:
- `bol_force_complete` (default false) — when true, all pickup stops show as BOL-complete
- `pod_force_complete` (default false) — when true, all delivery stops show as POD-complete, and status is set to "delivered"

### UI Changes (src/pages/Reports.tsx)

1. **Document Status section (line ~6278)**: After rendering BOL/POD badges, show a small "✓ Complete" button when:
   - The doc type is BOL and pickup stops > 1 and BOL file count < pickup stop count and `bol_force_complete` is not already true
   - The doc type is POD and delivery stops > 1 and POD file count < delivery stop count and `pod_force_complete` is not already true

2. **Confirmation dialog**: Use AlertDialog — "Are you sure you want to mark all [BOL/POD] as complete? This will treat all [pickup/delivery] stops as having documents uploaded."

3. **On confirm**:
   - Update `orders.bol_force_complete = true` or `orders.pod_force_complete = true`
   - For POD complete: also set `status = 'delivered'` and set `checked_out_at` on all delivery stops that don't have it
   - Optimistically update `zoomedLoad` state
   - Invalidate caches

4. **Cell coloring logic (lines ~1578, ~1628)**: Update `getPickupCellClass` and `getDeliveryCellClass` to check force_complete flags — if true, treat all stops as having documents.

### Data Flow
- Fetch `bol_force_complete` and `pod_force_complete` from orders (via edge functions and direct queries)
- Pass through to `zoomedLoad` state and cell coloring functions
- The `ordersTransform` utility will need to expose these fields

### Files to Modify
- **Migration**: Add `bol_force_complete` and `pod_force_complete` columns
- **src/pages/Reports.tsx**: Add Complete button + confirmation dialog + update cell coloring logic
- **src/utils/ordersTransform.ts**: Pass through the new fields
- **Edge functions** (`get-all-unlocked-orders`, `get-all-locked-orders`): Include new columns in SELECT

