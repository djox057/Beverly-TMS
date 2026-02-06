
# RLS Policy Optimization - Phase 2

## Problem
The Phase 1 optimization consolidated policies on the 5 core tables (companies, drivers, trucks, orders, pickup_drops), but **~50 other tables** still use the old `has_role()` pattern, which triggers individual `user_roles` lookups per role per row. The `user_roles` table has accumulated **2.5 billion index scans** -- the single highest-scanned table in the entire database. Statement timeouts are still occurring on complex queries involving `order_files` and `pickup_drops` joins.

## Approach
Consolidate RLS policies on the **next-highest-impact tables** using the same `has_any_role()` pattern from Phase 1. Prioritized by query volume and policy count:

### Batch 1 - Highest Impact (queried on every page load)
| Table | Current Policies | Target | Index Scans |
|-------|-----------------|--------|-------------|
| order_files | 19 | ~5 | 5.8M |
| trailers | 19 | ~5 | 993K |
| brokers | 11 | ~4 | 833K |
| user_roles | 15 | ~4 | 2.5B |
| profiles | 14 | ~4 | 6.2M |

### Batch 2 - Medium Impact (queried on Reports/Trips)
| Table | Current Policies | Target |
|-------|-----------------|--------|
| truck_notes | 13 | ~4 |
| lost_day_notes | 10 | ~4 |
| truck_files | 22 | ~5 |
| trailer_files | 22 | ~5 |
| driver_files | 16 | ~5 |

### Batch 3 - Lower Impact (less frequently queried)
| Table | Current Policies | Target |
|-------|-----------------|--------|
| order_transfers | 5 | ~4 |
| recovery_history | 8 | ~4 |
| dispatcher_status | 8 | ~4 |
| truck_locations | 10 | ~4 |
| driver_sensitive_pii | 10 | ~4 |
| driver_performance | 10 | ~4 |
| driver_drug_tests | 9 | ~4 |
| Remaining ~25 tables | 2-8 each | ~2-4 each |

## Technical Details

For each table, the migration will:
1. Drop all existing individual `has_role()` policies
2. Create consolidated policies using `has_any_role()` with role arrays
3. Preserve any special-case policies (e.g., driver self-access, supervisor office filtering)

Example transformation for `order_files` (19 policies to ~5):
```text
BEFORE: 9 separate SELECT policies (one per role)
AFTER:  1 "Roles can view order_files" + 1 "Drivers can view own order files"

BEFORE: 5 separate INSERT/UPDATE/DELETE policies
AFTER:  1 each for INSERT, UPDATE, DELETE using has_any_role()
```

## Execution Plan
- Run migrations in batches to avoid deadlocks (learned from Phase 1)
- Batch 1 first (biggest performance win), then Batch 2, then Batch 3
- Each batch as a single migration with all DROP + CREATE statements
- Total estimated reduction: ~300 policies down to ~120, eliminating hundreds of millions of redundant `user_roles` lookups per day

## Risk Mitigation
- Each migration is atomic (all-or-nothing within a transaction)
- Policies are recreated in the same transaction as drops, so there is no window without access control
- The `has_any_role()` function is already proven on the 5 core tables from Phase 1
