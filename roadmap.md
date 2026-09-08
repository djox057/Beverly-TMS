# Roadmap: DB CPU reduction

- [ ] 1. Emergency stabilization: remove 60s polling (drivers/trucks/trailers), focus refresh w/ cooldown, shared query per dataset, fetch only when mounted/visible
- [ ] 2. RLS: init-plan pattern `(select auth.uid())` / helpers on drivers, trucks, trailers, brokers, files, user_roles; verify indexes
- [ ] 3. Reduce query size: drop select('*') on hot lists, split lightweight dropdown data
- [ ] 4. Targeted freshness: per-row invalidation instead of whole-list refetch
- [ ] 5. Measure: reset pg_stat_statements, compare window
- [ ] 2b. RLS rewrite via explicit ALTER POLICY on SELECT policies of hot tables only (drivers, trucks, trailers, brokers, companies, profiles, user_roles, files tables); preview, then verify plans under a real authenticated role; report execution time not CPU
- [x] 2b-cleanup. 32 double-wrapped policies fixed via explicit ALTER POLICY (446 policies, 0 double-wrapped, permissions unchanged)
- [ ] 2c. Verify plans/permissions under real signed-in roles (blocked: external Supabase, no test session; pg_stat_statements_reset not permitted — use Supabase dashboard Query Performance reset)

## Audit implementation (2026-09-08)
- [x] A1 (F1). One refresh owner per dataset in realtimeBus (fallbackKey dedupe) + 30s focus/interval cooldown
- [x] A2 (F3). Reports adapter no longer refetches on every query lifecycle tick, only on genuinely new list data
- [x] A3. Live Oil Change: 1 DB lookup for latest odometer file instead of ~476 Storage list calls
- [ ] A4 (F2). Column projections instead of select('*') on drivers/trucks/trailers + split lookup caches
- [ ] A5 (F5/F6). Real event coverage for drivers/trucks/trailers (needs HOS off `drivers` first) -> 2s freshness target
- [ ] A6 (telemetry). hos-sync no-op guards, real job lease for update-truck-distances, fix row counts
- [ ] A7 (F4). Single order-change coordinator; stop global enrichment on non-order pages
- [ ] A8 (F7/F8). Truthful channel status, gap recovery, cache clearing on sign-out/role change
- [ ] A9. Analytics server-side aggregates (deferred by user until last)
- [ ] A10. Restrict bulk_update_hos / legacy bulk_update_truck_distances to backend callers
- Anon read access on drivers/trucks/trailers: user chose to keep for now (revisit)
- [x] A4a (#1). Reports: Edit Driver loads one driver on open; All Problems mounts only while open (batched id/name); Reports truck query projected to used fields
