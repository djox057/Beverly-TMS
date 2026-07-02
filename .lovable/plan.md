I found the reason 7461 still shows broker `0305437`: the database query in `TrucksMap.tsx` is hitting Supabase’s default 1000-row limit per chunk. Since the first truck chunk has 4864 matching orders, the newer 7461 order `21529-AP / 2026833` is not reliably included in the frontend result, so the map falls back to the old `18271-AP / 0305437` load.

Plan:
1. Change the fleet-map orders fetch so it does not rely on the default 1000-row limit.
2. Fetch orders in smaller truck chunks and explicitly order by pickup time, so each chunk stays under the limit and newest/current loads are included.
3. Keep the current load-picking priority: open BOL/no POD first, then open started pickup, then upcoming open, then historical fallback.
4. Keep multi-pick/drop marker behavior unchanged, but ensure the selected load data includes all stops for the correct order.
5. Verify truck 7461 resolves to load `21529-AP` and broker `2026833` after the change.