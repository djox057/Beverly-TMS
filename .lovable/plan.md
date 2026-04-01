

## Problem

When an order's truck/driver changes to one belonging to a different company, the `reassign_internal_load_number` RPC assigns a **new** internal load number from the new company's sequence. This caused order "52688977" to change from `7941-BF` to `12505-UE`.

The user wants:
1. **Internal load number should NEVER change** once an order is created
2. **Change the column type to text** so the suffix (e.g., `-BF`, `-UE`) can be stored directly in the database

## Current State

- `orders.internal_load_number` is `integer` — suffix is computed at display time via `formatInternalLoadNumber()`
- `reassign_internal_load_number` RPC reassigns the number when company changes
- `create_order_with_unique_load_number` RPC generates the number at creation time
- ~13 files use `formatInternalLoadNumber()` for display

## Plan

### 1. Database Migration — Convert column to text and store suffix

- `ALTER TABLE orders ALTER COLUMN internal_load_number TYPE text USING internal_load_number::text;`
- Run a one-time UPDATE to stamp the suffix onto all existing rows based on their current `company_id` (join to `companies` table to get company name, apply suffix logic in SQL)
- Update `create_order_with_unique_load_number` RPC to store the full suffixed value (e.g., `"7941-BF"`) at creation time, keeping the sequential numbering logic but appending the company suffix before inserting
- **Drop** the `reassign_internal_load_number` RPC — it should never be called again
- Update index on `internal_load_number` (already text-compatible)

### 2. Remove reassignment logic from EditOrder

- **`src/pages/EditOrder.tsx`**: Remove the `companyChanged` block (lines ~2419-2434) that calls `reassign_internal_load_number`. When company changes, just update `company_id` normally — internal load number stays frozen.

### 3. Simplify display — stop computing suffix at runtime

- **`src/utils/formatInternalLoadNumber.ts`**: Simplify `formatInternalLoadNumber()` to just return the stored string value as-is (since the suffix is now baked in). Keep `parseInternalLoadNumber()` for any numeric extraction needs.
- All ~13 consumer files continue calling `formatInternalLoadNumber()` but now it's a passthrough — no code changes needed in those files.

### 4. Update creation flow

- **`src/pages/NewOrder.tsx`** / **`src/hooks/useNextInternalLoadNumber.ts`**: The RPC already handles creation. The hook is used for preview display — update it to return the formatted string with suffix.
- Update the `create_order_with_unique_load_number` RPC to compute and store the suffix (using the same company-name-to-suffix mapping, implemented in SQL).

### 5. Fix the specific order

- Run an UPDATE to set order "52688977" back to its correct internal load number value as text with the proper suffix.

### Technical Details

**SQL suffix mapping** (in the updated RPC):
```sql
CASE
  WHEN company_name ILIKE '%bf prime united%' THEN 'BFU'
  WHEN company_name ILIKE '%bf prime%' THEN 'BFP'
  WHEN company_name ILIKE '%beverly freight%' THEN 'BF'
  WHEN company_name ILIKE '%united enterprise%' THEN 'UE'
  WHEN company_name ILIKE '%bg prime%' THEN 'BG'
  WHEN company_name ILIKE '%ap silver%' THEN 'AP'
  ELSE ''
END
```

**Files modified**:
- 1 new migration (alter column, backfill suffixes, update RPCs)
- `src/pages/EditOrder.tsx` — remove reassignment logic
- `src/utils/formatInternalLoadNumber.ts` — simplify to passthrough
- `src/hooks/useNextInternalLoadNumber.ts` — minor type adjustment
- `src/integrations/supabase/types.ts` — auto-updated after migration

