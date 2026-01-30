

# Fix: Search for Internal Load Numbers with Company Suffix

## Problem

Users see internal load numbers displayed as `6538-BFU` in the UI, but the database stores only the integer `6538`. When a user searches for "6538-BFU", the search fails because:

1. Current logic: `const isNumericTerm = /^\d+$/.test(term)` → `false` for "6538-BFU"
2. Since it's not purely numeric, `internal_load_number` is not included in the search filter
3. The order is never found

## Solution

Use the existing `parseInternalLoadNumber()` utility to extract the numeric portion from search terms that match the formatted pattern (e.g., "6538-BFU" → `6538`).

## Implementation

### File: `src/hooks/useOrdersSearch.ts`

**Change 1**: Import the parse utility

```typescript
import { parseInternalLoadNumber } from "@/utils/formatInternalLoadNumber";
```

**Change 2**: Update search filter logic (around lines 99-104)

Replace:
```typescript
const isNumericTerm = /^\d+$/.test(term);
const stringFieldsFilter = `load_number.ilike.%${term}%,broker_load_number.ilike.%${term}%`;
const searchFilter = isNumericTerm 
  ? `${stringFieldsFilter},internal_load_number.eq.${term}`
  : stringFieldsFilter;
```

With:
```typescript
// Check if term is purely numeric
const isNumericTerm = /^\d+$/.test(term);

// Check if term matches formatted internal load number pattern (e.g., "6538-BFU")
const parsedInternalLoadNumber = parseInternalLoadNumber(term);
const hasValidInternalLoadNumber = parsedInternalLoadNumber !== null;

// Build string fields filter (always search these)
const stringFieldsFilter = `load_number.ilike.%${term}%,broker_load_number.ilike.%${term}%`;

// Build search filter - include internal_load_number when we have a valid numeric value
let searchFilter: string;
if (isNumericTerm) {
  // Pure number like "6538" - exact match on internal_load_number
  searchFilter = `${stringFieldsFilter},internal_load_number.eq.${term}`;
} else if (hasValidInternalLoadNumber) {
  // Formatted number like "6538-BFU" - extract numeric part for internal_load_number
  searchFilter = `${stringFieldsFilter},internal_load_number.eq.${parsedInternalLoadNumber}`;
} else {
  // Non-numeric term - only search string fields
  searchFilter = stringFieldsFilter;
}
```

## How It Works

| Search Term | `isNumericTerm` | `parsedInternalLoadNumber` | Filter Includes |
|-------------|-----------------|---------------------------|-----------------|
| `6538` | `true` | `6538` | `internal_load_number.eq.6538` |
| `6538-BFU` | `false` | `6538` | `internal_load_number.eq.6538` |
| `6538-bfu` | `false` | `6538` | `internal_load_number.eq.6538` |
| `abc123` | `false` | `null` | Only string fields |
| `ABC-XYZ` | `false` | `null` | Only string fields |

## Expected Behavior After Fix

1. User types "6538-BFU" in search
2. `parseInternalLoadNumber("6538-bfu")` returns `6538`
3. Search filter includes `internal_load_number.eq.6538`
4. Database finds the order with `internal_load_number = 6538`
5. Result displays correctly with formatted suffix "6538-BFU"

