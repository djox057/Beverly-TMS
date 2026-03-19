## Fix: Duplicate mileage recalculations in New Order

### Root cause

Two issues cause mileage to calculate multiple times:

**1. Loaded miles effect (line 396-472) triggers itself via geocoding**

- The effect depends on `pickupsDrops`
- When addresses lack coordinates, it geocodes them and calls `setPickupsDrops(updatedItems)` (line 430)
- This mutates `pickupsDrops`, which re-triggers the same effect
- The `return` on line 431 prevents double calculation in that cycle, but the re-trigger then runs the full calculation
- If multiple items need geocoding, each geocode pass may only update some items, causing a chain of re-triggers

**2. DH miles effect (line 475-520) depends on `pickupsDrops**`

- Every time `pickupsDrops` changes (including from the geocoding updates above), DH miles recalculates
- Combined with the loaded miles geocoding loop, DH miles can fire 2-3 times

### Fix

**File: `src/pages/NewOrder.tsx**`

**Change 1: Separate geocoding from mile calculation**

- Split the loaded-miles `useEffect` into two effects:
  - **Geocoding effect**: watches `pickupsDrops`, geocodes missing coordinates, updates state. No mile calculation.
  - **Mile calculation effect**: watches `pickupsDrops` but only runs when ALL stops have coordinates (skip if any are missing). This ensures it fires exactly once after geocoding is complete.

**Change 2: Guard DH miles with a stable pickup address ref**

- Track the last pickup address + truck combo that was used for DH calculation in a ref (`lastDhCalcKey`)
- Before calculating, compare current key to ref. If same, skip. This prevents redundant DH calls when `pickupsDrops` changes but the first pickup address hasn't actually changed.

**Change 3: Guard loaded miles with a stable addresses ref**

- Similarly track the last set of addresses used for loaded miles calculation in a ref (`lastLoadedCalcKey`)
- Skip if the addresses string hasn't changed from the last successful calculation

### Summary of changes

- Split 1 effect into 2 (geocoding vs calculation) to break the self-triggering loop
- Add dedup refs for both DH and loaded miles to prevent redundant API calls
- No behavioral changes — miles still auto-calculate, just exactly once per address change