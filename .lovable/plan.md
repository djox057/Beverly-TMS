

## Fix Orders Search Bar — Remove parseInt Flooding

**Problem**: `parseInternalLoadNumber` runs `parseInt` on the search term, so "7EL8601" becomes `7`, matching all orders with internal_load_number starting with "7".

**Fix**: Search `internal_load_number` using the raw search term (substring match), not the parsed numeric value. Remove the `parseInternalLoadNumber` call entirely from search logic.

### Changes

**File: `src/hooks/useOrdersSearch.ts`**

Replace the conditional search filter block (~lines 114-122) with a single, unconditional filter:

```typescript
const searchFilter = `broker_load_number.ilike.%${term}%,internal_load_number.ilike.%${term}%`;
```

This removes the `parseInternalLoadNumber` call and the branching logic. Both fields get a simple substring match (`%term%`), so "7EL8601" only returns orders where either field actually contains "7EL8601".

Remove the `parseInternalLoadNumber` import as well.

