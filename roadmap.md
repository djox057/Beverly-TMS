# Roadmap: DB CPU reduction

- [ ] 1. Emergency stabilization: remove 60s polling (drivers/trucks/trailers), focus refresh w/ cooldown, shared query per dataset, fetch only when mounted/visible
- [ ] 2. RLS: init-plan pattern `(select auth.uid())` / helpers on drivers, trucks, trailers, brokers, files, user_roles; verify indexes
- [ ] 3. Reduce query size: drop select('*') on hot lists, split lightweight dropdown data
- [ ] 4. Targeted freshness: per-row invalidation instead of whole-list refetch
- [ ] 5. Measure: reset pg_stat_statements, compare window
- [ ] 2b. RLS rewrite via explicit ALTER POLICY on SELECT policies of hot tables only (drivers, trucks, trailers, brokers, companies, profiles, user_roles, files tables); preview, then verify plans under a real authenticated role; report execution time not CPU
