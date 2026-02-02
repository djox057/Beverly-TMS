
# Fix: Truck Number Search Auto-Switch Protection Not Working

## Problem Analysis

The Reports page search has an "auto-switch" feature that changes the active office tab when a search term is found in a different office. While this works correctly for driver name searches, it's too aggressive for truck number searches - users cannot manually switch away from the auto-selected tab because the system keeps switching them back.

### Root Cause

After extensive code analysis, the issue appears to be a **race condition or timing problem** in the manual tab switch detection logic:

1. When user types "327" (truck number), auto-switch correctly finds and switches to the truck's office (e.g., KRAGUJEVAC)
2. User manually clicks another tab (e.g., ČAČAK)
3. The `manualTabSwitchRef` is set to block auto-switching
4. **However**, the truck search effect still runs and bypasses the protection

The specific issue is that the manual switch detection checks `lastSwitch?.targetOffice !== activeTab` (line 402), which can be flaky when:
- Multiple effects run in quick succession
- The ref values are read at different points in the render cycle
- State updates within effects trigger additional renders

### Why Driver Name Works

For driver name searches, the `hasLocalMatch` function often returns `true` when checking the current tab's data (drivers might have partial name matches across multiple offices). This causes an early return before the DB lookup that would trigger a switch.

For truck numbers, trucks are typically unique to a single dispatcher/office, so `hasLocalMatch` returns `false` when the user switches to a different office, triggering the DB lookup which always finds the truck in its original office.

---

## Solution

Implement a more robust protection mechanism that tracks user intent more reliably:

### 1. Add Stable "User Override" State

Instead of relying on refs that can be affected by timing issues, add a timestamp-based "user override" system that completely disables auto-switching for a search term once the user has demonstrated they want a different tab.

```typescript
// Track when user explicitly overrode auto-switch (timestamp-based for robustness)
const userOverrideRef = useRef<{
  filter: "truck" | "dispatch" | "load";
  value: string;
  overrideTime: number;
} | null>(null);
```

### 2. Extend Override Duration

When a user manually switches tabs while a search is active, block auto-switching for that search term **indefinitely** (until the filter value changes), not just for a cooldown period.

### 3. Fix Manual Switch Detection Order

The current detection checks if `lastSwitch?.targetOffice !== activeTab`, which fails when the user tries to switch to the SAME office that was auto-switched to. Simplify this to: "any tab change while a search is active and we already did an auto-switch = manual override".

### 4. Add Filter-Specific Blocking

Track overrides per filter type more explicitly, ensuring that a truck number override doesn't accidentally get cleared when dispatch or load filters change.

---

## Implementation Details

### File: `src/hooks/useAutoSwitchOffice.ts`

#### Change 1: Add User Override Tracking (lines 51-68)

Add a more robust override tracking mechanism:

```typescript
// Track when user explicitly overrode auto-switch
// This completely disables auto-switch for the specific filter+value until cleared
const userOverrideRef = useRef<{
  filter: "truck" | "dispatch" | "load";
  value: string;
} | null>(null);
```

#### Change 2: Fix Manual Switch Detection Effect (lines 396-414)

Simplify the detection logic to be more reliable:

```typescript
useEffect(() => {
  const prevTab = prevActiveTabRef.current;
  
  // If tab changed at all (not just from auto-switch)
  if (prevTab !== activeTab) {
    const lastSwitch = lastAutoSwitchRef.current;
    
    // If we auto-switched before and user is now on a DIFFERENT tab than the target,
    // they're explicitly overriding our switch
    if (lastSwitch && lastSwitch.targetOffice !== activeTab) {
      // User overrode the auto-switch - block ALL further switches for this search
      if (debouncedTruckDriver && debouncedTruckDriver.trim().length >= 2) {
        userOverrideRef.current = { filter: "truck", value: debouncedTruckDriver };
      } else if (debouncedDispatchName && debouncedDispatchName.trim().length >= 2) {
        userOverrideRef.current = { filter: "dispatch", value: debouncedDispatchName };
      } else if (debouncedLoadNumber && debouncedLoadNumber.trim().length >= 3) {
        userOverrideRef.current = { filter: "load", value: debouncedLoadNumber };
      }
    }
  }
  
  prevActiveTabRef.current = activeTab;
}, [activeTab, debouncedTruckDriver, debouncedDispatchName, debouncedLoadNumber]);
```

#### Change 3: Update Truck Search Effect (lines 416-513)

Check the user override ref early and exit immediately:

```typescript
// Main effect for Truck/Driver filter
useEffect(() => {
  if (!debouncedTruckDriver) {
    // ... existing cleanup code ...
    // Also clear user override when filter is cleared
    if (userOverrideRef.current?.filter === "truck") {
      userOverrideRef.current = null;
    }
    return;
  }
  
  // ... min length check ...
  
  // NEW: Check if user explicitly overrode auto-switch for this search
  const userOverride = userOverrideRef.current;
  if (userOverride?.filter === "truck" && userOverride?.value === debouncedTruckDriver) {
    // User overrode - do NOT auto-switch, just show status
    setTruckSearchStatus("found");
    return;
  }
  
  // ... rest of existing logic ...
}, [/* existing deps */]);
```

#### Change 4: Apply Same Pattern to Dispatch and Load Effects

Apply the same `userOverrideRef` check to the dispatch name and load number effects for consistency.

---

## Testing Checklist

After implementation, verify:

1. **Truck Number Auto-Switch**: Type a truck number that exists in a different office - should auto-switch
2. **Manual Override Works**: After auto-switch, click a different tab - should stay on that tab
3. **Override Persists**: While on the manually-selected tab with search still active, wait several seconds - should NOT switch back
4. **Clear on Filter Change**: Clear the truck number filter - override should reset
5. **Driver Name Still Works**: Driver name search should work the same as before
6. **Load Number Still Works**: Load number search should work the same as before
7. **New Search Triggers Switch**: After clearing and typing a new truck number, auto-switch should work again
