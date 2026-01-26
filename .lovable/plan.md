
# Fix Pre-Aggregated Analytics: Errors and UI Mismatch

## Problem Summary

Three critical issues were identified:

1. **Database Duplicate Rows Error**
   - The `analytics_period_totals` table has duplicate rows with `office: null` for the same period
   - The edge function inserts a "global" row with `office: null` AND an "Unknown" office row that also maps to `office: null`
   - This causes `.maybeSingle()` to fail with "JSON object requested, multiple (or no) rows returned"

2. **UI Layout Changed**
   - The new `DispatcherAnalyticsAggregated` component completely replaced the original tab structure
   - Missing: tabs for "Driver Gross Rankings", "Loads (count)", "Salaries"
   - Missing: week/month selectors in the same style as original
   - Missing: office filter buttons, date range picker

3. **Wrong Amounts**
   - The edge function only queries `locked = false` orders (123 orders shown)
   - The original Analytics counted ALL database orders regardless of lock status
   - This is actually correct per user requirements (DB-only, no archives) but may need verification

---

## Technical Root Causes

### 1. Duplicate Totals Row Bug

In `supabase/functions/calculate-analytics/index.ts` lines 360-394:

```typescript
const totalRows = [
  // Global total (office = null)
  { office: null, ... },
  // Per-office totals
  ...Object.entries(officeAggregates).map(([office, agg]) => ({
    office: office === 'Unknown' ? null : office,  // BUG: Creates second null!
    ...
  }))
];
```

When `officeAggregates` contains `"Unknown"` key, it creates TWO rows with `office: null`.

### 2. Hook Error Handling

In `src/hooks/useAnalyticsAggregates.ts` line 119:

```typescript
const { data, error } = await query.maybeSingle();
```

While `.maybeSingle()` is correct for 0-1 rows, it throws an error when 2+ rows exist (which happens due to bug #1).

### 3. UI Component Replacement

The `DispatcherAnalyticsAggregated` component renders standalone summary cards and a table, but the original Analytics page used:
- A tabbed interface with 4 tabs
- Different layout for summary stats (inline in a box, not cards)
- Office filter buttons
- Week/month dropdown selectors with date range picker

---

## Implementation Plan

### Phase 1: Fix Database and Edge Function

#### 1.1 Clean Duplicate Rows
Run SQL to delete duplicate `office: null` rows, keeping only the most recent:

```sql
DELETE FROM analytics_period_totals 
WHERE id IN (
  SELECT id FROM (
    SELECT id, 
           ROW_NUMBER() OVER (PARTITION BY period_type, period_start, office ORDER BY last_calculated_at DESC) as rn
    FROM analytics_period_totals
    WHERE office IS NULL
  ) t WHERE rn > 1
);
```

#### 1.2 Fix Edge Function
Update `supabase/functions/calculate-analytics/index.ts`:
- Remove "Unknown" office from per-office aggregates before upserting
- Ensure only ONE global total row is created

```typescript
// Filter out "Unknown" from office aggregates since global handles those
const validOfficeAggregates = Object.entries(officeAggregates)
  .filter(([office]) => office !== 'Unknown');

const totalRows = [
  { office: null, ... }, // Global only
  ...validOfficeAggregates.map(([office, agg]) => ({
    office, // Never null here
    ...
  }))
];
```

### Phase 2: Fix Hook Error Handling

#### 2.1 Update `useAnalyticsAggregates.ts`
Change totals query to handle edge cases gracefully:

```typescript
// Use .limit(1) instead of .maybeSingle() for safety
const { data, error } = await query.order('last_calculated_at', { ascending: false }).limit(1);
return (data && data.length > 0) ? data[0] : null;
```

### Phase 3: Restore Original UI Layout

#### 3.1 Update `DispatcherAnalyticsAggregated.tsx`
The component should match the original Analytics layout:

**Header Section:**
- Add week/month dropdowns (using props passed from parent)
- Add date range picker option
- Add office filter buttons (for admin/manager)
- Add "100k+ Gross" toggle

**Summary Section:**
- Change from 4 Cards to inline stats box matching original:
  - Total Freight, Total Miles, Avg Rate/Mile, Total Comm., Comm. %

**Table Section:**
- Match original column order: Dispatcher, Total Freight, Total Miles, Rate/Mile, Comm., Comm. %, Avg Trucks
- Include ranking icons (crown, medals) for top 3
- Include office badges

#### 3.2 Keep Tabs Visible
The parent `Analytics.tsx` should still show all 4 tabs:
- Dispatcher Performance (uses pre-aggregated or legacy)
- Driver Gross Rankings (always legacy for now)
- Loads (always legacy)
- Salaries (always legacy)

Only the "Dispatcher Performance" tab content changes based on mode.

---

## Files to Modify

| File | Changes |
|------|---------|
| `supabase/functions/calculate-analytics/index.ts` | Fix duplicate null office bug |
| `src/hooks/useAnalyticsAggregates.ts` | Fix `.maybeSingle()` error handling |
| `src/components/DispatcherAnalyticsAggregated.tsx` | Match original UI layout (stats box, table columns, selectors) |
| `src/pages/Analytics.tsx` | Ensure tabs remain visible, only Dispatcher Performance tab uses pre-agg |

---

## Data Verification Note

The pre-aggregated analytics shows:
- **$198,490.38** Total Gross
- **123 orders**

This is for the current week from database-only orders (no archives). The original Analytics using all orders shows higher totals because it includes archived/locked orders. Per user requirements, the pre-aggregated mode should NOT include archives - so these numbers may be intentionally different from legacy mode.

If legacy mode shows ~$14M total, that includes historical archived data which the new system excludes by design.

---

## Acceptance Criteria Verification

After implementation:
1. No "multiple rows returned" errors
2. UI matches original Analytics layout (tabs, stats box, table)
3. Pre-aggregated mode loads only aggregate data (no `useOrders` call)
4. Amounts reflect database-only orders as specified
5. Toggle between modes works correctly
