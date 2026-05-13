## The bug (very likely real, not a hunch)

In `src/utils/ordersFlatBatchFetch.ts`, `batchFetchIn()` fetches related rows like this:

```ts
supabase.from(table).select(selectCols).in(column, batch)  // batch = 300 ids
```

Supabase silently caps every query result at **1000 rows**. There is no `.order()` and no `.range()` pagination. So for `order_files`, each batch of 300 orders can return at most 1000 file rows — the rest are dropped without any error.

Average file count per order grows with usage:
- RC (1) + revised RC / ADDITIONAL (1–2) + BOL per pickup (1+) + POD per delivery (1+) ⇒ frequently 4–8+ files per order.
- 300 orders × 4 files = 1200 rows → already truncated.
- Older orders that have accumulated extra documents (revised RC uploaded later, multi-stop BOL/POD, additional attachments) push past the cap easily.

When the result is truncated, *which* category gets dropped is essentially arbitrary (depends on internal row order). That matches the user's symptom exactly: "for some loads RC isn't included in the invoice PDF, especially after ~10 days."

The downstream code is innocent:
- `ordersTransform.ts` filters `orderFiles` by `file_category === "RC"` → empty array if the RC row was truncated away.
- `invoiceGenerator.ts` passes `rcFiles` (now empty) to `merge-pdfs` → the edge function logs `Processing 0 RC file(s)` and produces an invoice without the RC.

Confirmation that this pattern is a known footgun in this codebase: `src/hooks/useLumperMissingRevisedRC.ts` already paginates `order_files` defensively with `ID_BATCH=100` and explicit `.range(from, from + PAGE_SIZE - 1)` loop, with a comment noting the 1000-row default. The invoice path was never updated to do the same.

## Fix

Make `batchFetchIn` (or at least the `order_files` call) page through results until exhausted, instead of trusting a single `.in()` call.

### Edit `src/utils/ordersFlatBatchFetch.ts`

1. Change `batchFetchIn` to paginate per batch:
   - Reduce per-batch id count to **100** for `order_files` and `pickup_drops` (the high-fanout children) to keep URLs short.
   - For each batch, loop with `.order("id", { ascending: true }).range(from, from + 999)` until a page returns fewer than 1000 rows.
   - Keep the simpler single-shot path for low-fanout tables (`order_transfers`, `recovery_history`) but still page if needed — easiest is to make pagination universal.

2. Apply this paginated fetch to all four child tables to prevent the same class of bug recurring on `pickup_drops` (which can also exceed 1000 rows for large batches).

### No other changes needed

- No DB migration.
- `ordersTransform.ts`, `invoiceGenerator.ts`, and `merge-pdfs` are correct downstream of complete data.
- The storage files themselves are not corrupted — the user's "corruption" hypothesis is a red herring; the files are simply never sent to the merge function.

## Verification plan

After the fix:
1. Run invoice generation for a batch of older orders that previously dropped RCs.
2. Check browser console: `Processing N RC file(s)` in `merge-pdfs` logs should equal the actual RC count.
3. Spot-check the merged PDF for 2–3 affected loads.

## Risk / scope

Tiny, isolated change in one helper. Slightly more requests for very large batches, but each is fast and parallelizable. No behavior change for small batches.
