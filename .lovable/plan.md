

## Fix: Paginate order_files fetch in useLumperMissingRevisedRC

### Verification result

Line 54 destructures `filesRes` as `filesRes.data || []` -- only `.data` is accessed, `.error` is never checked. The `|| []` fallback handles `undefined`/`null` safely. The IIFE returning `{ data: allFiles }` is fully compatible with no changes needed to downstream code.

### Change

**File: `src/hooks/useLumperMissingRevisedRC.ts` (line 48)**

Replace the single query:

```typescript
supabase.from("order_files").select("id, order_id, file_category, file_name").in("order_id", orderIds),
```

With a paginated IIFE:

```typescript
(async () => {
  let allFiles: { order_id: string; file_category: string }[] = [];
  let from = 0;
  const PAGE_SIZE = 1000;
  while (true) {
    const { data } = await supabase
      .from("order_files")
      .select("order_id, file_category")
      .in("order_id", orderIds)
      .range(from, from + PAGE_SIZE - 1);
    allFiles = [...allFiles, ...(data || [])];
    if (!data || data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return { data: allFiles };
})(),
```

No other lines need to change. The `filesRes.data || []` on line 54 and the `filesByOrder` map construction on lines 53-58 work as-is since the IIFE returns the same `{ data: [...] }` shape.

### Summary

- One line replaced (line 48)
- Permanently fixes the 1000-row truncation bug
- Columns trimmed from 4 to 2 (`order_id, file_category` only)
- Fixes both Orders page and Reports page (shared hook)

