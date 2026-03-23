

## Fix: Swap Trailers Race Condition in EditOrder

### Problem

The trailer swap executes two sequential DB writes with no transactional guarantee. The `useTrucksRealtime` hook patches cache key `["trucks", "v2"]`, but the invalidation at line 1758 targets `["trucks"]` — a key nothing reads from. The invalidation is a no-op. The UI only updates if/when both realtime events happen to arrive and flush correctly.

### Fix (3 parts)

**1. Parallel writes + correct refetch (lines 1737-1758)**

Replace the two sequential updates with `Promise.all` for shorter partial-state window, then `await refetchQueries` on the correct key:

```typescript
if (data.swapTrailers && trailerId && data.recoveryTrailerId && truck) {
  const [r1, r2] = await Promise.all([
    supabase.from("trucks").update({ trailer_id: data.recoveryTrailerId }).eq("id", truck),
    supabase.from("trucks").update({ trailer_id: trailerId }).eq("id", data.recoveryTruckId),
  ]);
  if (r1.error) throw r1.error;
  if (r2.error) throw r2.error;

  // Hard refetch ensures UI shows final DB state regardless of realtime event ordering
  await queryClient.refetchQueries({ queryKey: ["trucks", "v2"] });
}
```

No delay. The refetch is the correctness guarantee; the parallelization is performance hygiene.

**2. Fix the same stale key at line 2137**

There's a second `invalidateQueries({ queryKey: ["trucks"] })` at line 2137. Change to `refetchQueries({ queryKey: ["trucks", "v2"] })` for consistency.

**3. Note on transactional RPC (not in scope)**

A Postgres RPC that swaps both trailer_ids in a single transaction would eliminate the partial-state window entirely. This is the robust long-term fix but is out of scope for this change — the hard refetch makes the UI correct regardless.

### Files Changed
- `src/pages/EditOrder.tsx` — lines 1737-1758 and line 2137

