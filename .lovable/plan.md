

# Fix: Integer Overflow in `create_order_with_unique_load_number` RPC

## Problem

The RPC function `create_order_with_unique_load_number` uses `::integer` casts for `loaded_miles`, `dh_miles`, and `mileage`, but the actual columns are `numeric(10,2)`. When OCR sends garbage like `8530063736` (a phone number misread as mileage), the cast fails and triggers retry storms that spike CPU to 100%.

## Solution

A single migration that replaces the three `::integer` casts with a safe pattern: validate the input is actually numeric before casting, otherwise insert NULL.

### Pattern

```sql
CASE
  WHEN NULLIF(order_data->>'mileage', '') ~ '^[0-9]+(\.[0-9]+)?$'
  THEN (order_data->>'mileage')::numeric
  ELSE NULL
END
```

This applies to all three fields: `loaded_miles`, `dh_miles`, `mileage`.

## Technical Details

### File: New migration `supabase/migrations/[timestamp]_fix_rpc_integer_overflow.sql`

The migration will `CREATE OR REPLACE FUNCTION public.create_order_with_unique_load_number(order_data jsonb)` with the exact same body, changing only the three lines:

```sql
-- Before (lines in the INSERT VALUES):
NULLIF(order_data->>'loaded_miles', '')::integer,
NULLIF(order_data->>'dh_miles', '')::integer,
NULLIF(order_data->>'mileage', '')::integer,

-- After:
CASE WHEN NULLIF(order_data->>'loaded_miles', '') ~ '^[0-9]+(\.[0-9]+)?$'
     THEN (order_data->>'loaded_miles')::numeric ELSE NULL END,
CASE WHEN NULLIF(order_data->>'dh_miles', '') ~ '^[0-9]+(\.[0-9]+)?$'
     THEN (order_data->>'dh_miles')::numeric ELSE NULL END,
CASE WHEN NULLIF(order_data->>'mileage', '') ~ '^[0-9]+(\.[0-9]+)?$'
     THEN (order_data->>'mileage')::numeric ELSE NULL END,
```

### Why this is safe

- The target columns are already `numeric(10,2)` -- no type mismatch.
- The regex `^[0-9]+(\.[0-9]+)?$` only allows plain numbers (with optional decimal). Anything else (phone numbers, text, special characters) becomes NULL.
- NULL is safe for all three columns (they are nullable).
- No other code in the function uses these values after insertion (no loops, no offsets).
- `numeric(10,2)` columns will round the value automatically if needed.

### No other files change

The frontend already sends these values as strings in the JSON payload. The RPC handles parsing. No app-side changes needed.

