

## Switch `searchByLoadNumber` to flat+batch pattern

### Confirmed prerequisite
`internal_load_number` is `integer` (int4). Passing `parsedNumber` as a number to `.eq()` is correct.

### Changes — single file: `src/hooks/useTripsLazyOrders.ts`

1. **Remove `ORDERS_JOINED_SELECT` constant** (lines ~216-234) — no longer used.

2. **Rewrite `searchByLoadNumber`** to match the existing `searchByTruckOrDriver` pattern:
   - Both queries use `.select("*")` instead of the joined select (eliminates 13 lateral joins and their RLS overhead).
   - After deduplication, call `enrichOrdersWithRelations(unique)` then `transformOrders(enriched)`.

The resulting function:

```typescript
async function searchByLoadNumber(loadNumber: string): Promise<any[]> {
  if (!loadNumber || loadNumber.length < 2) return [];

  const searchLower = loadNumber.toLowerCase().trim();
  const parsedNumber = parseInternalLoadNumber(searchLower);

  const [internalResult, brokerResult] = await Promise.all([
    parsedNumber !== null
      ? supabase.from("orders").select("*").eq("internal_load_number", parsedNumber).limit(50)
      : Promise.resolve({ data: [] as any[], error: null }),
    supabase.from("orders").select("*").ilike("broker_load_number", `${searchLower}%`).limit(50),
  ]);

  if (internalResult.error) console.error("Error fetching by internal load#:", internalResult.error);
  if (brokerResult.error) console.error("Error fetching by broker load#:", brokerResult.error);

  const allOrders = [...(internalResult.data || []), ...(brokerResult.data || [])];
  const seen = new Set<string>();
  const unique = allOrders.filter(o => {
    if (seen.has(o.id)) return false;
    seen.add(o.id);
    return true;
  });

  if (unique.length === 0) return [];

  const enriched = await enrichOrdersWithRelations(unique);
  return transformOrders(enriched);
}
```

### Expected performance
- Flat queries: <100ms (indexed single-table lookups, no join RLS overhead)
- Batch enrichment for ~2-50 rows: ~200ms
- Total: <500ms, down from ~4s

