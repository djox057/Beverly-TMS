

# Phase B: Progressive Rendering for Tab Switches

## Problem

Switching to large offices (e.g., Kragujevac) freezes the UI for ~2 seconds. The bottleneck is CPU-bound: React synchronously renders all dispatcher groups (each with up to 12 trucks, 6 days of complex calendar cells) in a single frame. Small offices like Recovery render instantly because they have fewer trucks.

## Solution

Render dispatcher groups incrementally using `requestAnimationFrame`, so only one group renders per frame. The first group appears immediately, and subsequent groups stream in over the next few frames.

## Changes

### 1. Remove old `isTabSwitching` mechanism

**File:** `src/pages/Reports.tsx`

Remove:
- `isTabSwitching` state (line 363)
- `tabSwitchTimeoutRef` ref (line 364)
- The `requestAnimationFrame` logic inside `setActiveTab` (lines 366-376)
- The `isTabSwitching` conditional at line 3286-3287

Simplify `setActiveTab` to:
```typescript
const setActiveTab = useCallback((office: string) => {
  setActiveTabRaw(office);
}, []);
```

### 2. Add progressive rendering state and effect

**File:** `src/pages/Reports.tsx`

Add after the `activeOfficeReports` memo (~line 2870):

```typescript
const [visibleGroupCount, setVisibleGroupCount] = useState<number>(Infinity);
const progressiveRenderRef = useRef<number | null>(null);

useEffect(() => {
  if (progressiveRenderRef.current) {
    cancelAnimationFrame(progressiveRenderRef.current);
    progressiveRenderRef.current = null;
  }

  const totalGroups = activeOfficeReports.length;
  if (totalGroups <= 2) {
    setVisibleGroupCount(Infinity);
    return;
  }

  setVisibleGroupCount(1);

  let currentCount = 1;
  const renderNext = () => {
    currentCount += 1;
    if (currentCount >= totalGroups) {
      setVisibleGroupCount(Infinity);
    } else {
      setVisibleGroupCount(currentCount);
      progressiveRenderRef.current = requestAnimationFrame(renderNext);
    }
  };

  progressiveRenderRef.current = requestAnimationFrame(renderNext);

  return () => {
    if (progressiveRenderRef.current) {
      cancelAnimationFrame(progressiveRenderRef.current);
      progressiveRenderRef.current = null;
    }
  };
}, [activeOfficeReports]);
```

Key decisions per review feedback:
- **Dependency is `activeOfficeReports` (reference identity)**, not `.length`. This ensures re-trigger when content changes even if count stays the same.
- **Cleanup sets ref to `null`** to avoid stale reads.
- **Small offices (2 or fewer groups) skip progressive rendering** entirely.

### 3. Slice rendered groups

**File:** `src/pages/Reports.tsx` (line ~3312)

```typescript
// Before:
{activeOfficeReports.map((group) => { ... })}

// After:
{activeOfficeReports.slice(0, visibleGroupCount).map((group) => { ... })}
```

### 4. Remove unused `startTransition` import

**File:** `src/pages/Reports.tsx` (line 74)

Remove `startTransition` from the React import if not used elsewhere.

## Technical Details

### Why this works
- Each `requestAnimationFrame` callback only triggers one state update, which only adds one dispatcher group to the DOM per frame
- The existing per-group truck virtualization (`INITIAL_TRUCK_COUNT = 12`) is preserved on top of this
- React re-runs the component function on each increment, but the `.slice()` limits actual DOM work to just the newly added group

### Per-group frame cost concern
Per the review: if a single group has 12+ trucks with complex cells, one frame could still take 100-200ms. This is a known risk. The instrumentation from Phase A (`console.time('perf: transformedData')`) will help measure per-group cost. If any group causes jank above 100ms, a follow-up can split large groups across 2 frames. For now, shipping this and measuring is the right call.

### Scroll position concern
As groups stream in, the scrollbar height changes. This is acceptable because:
- Groups render top-to-bottom, so the visible content above the fold doesn't shift
- The full render completes in ~5-10 frames (~80-160ms), so the user barely notices scrollbar changes
- If it becomes noticeable, a follow-up can add `min-height` reservation

### Re-render overhead concern
Each `visibleGroupCount` increment re-runs the full 6,351-line component. This is acceptable for now because the `.slice()` limits DOM diffing. Phase C (extracting dispatcher groups into `React.memo` components) would make these re-renders nearly free and is the logical next step.

## Expected Result

| Scenario | Before | After |
|----------|--------|-------|
| Tab click response | ~2s freeze | Immediate |
| First group visible | ~2s | ~16ms |
| Full office rendered | ~2s (all at once) | ~160ms (streamed) |
| Small offices | Instant | Instant (unchanged) |

