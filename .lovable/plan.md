
# Individual Mode Implementation Plan

## Overview

This plan implements an "Individual Mode" toggle in the sidebar that provides dispatchers with a focused view:
- **Orders page**: Shows only orders booked by the current user
- **Reports page**: Shows only the user's own drivers/trucks by default
- **Reports search**: When searching, shows matched dispatcher(s) with full context
- **Fleets page**: No filtering (works normally)
- **Performance**: Zero impact when Individual mode is OFF

## Current Architecture Analysis

### Authentication & Profiles
- `AuthContext.tsx` wraps the app and provides `profile`, `roles`, `hasRole()`, `getPrimaryRole()`
- `useAuth.ts` fetches profile from `profiles` table which has: `id`, `user_id`, `email`, `full_name`, `office`, `ext`
- The `individual_mode` column does **not** exist yet - needs database migration

### Orders Page (`/orders`)
- Currently uses `useOrdersProgressive()` with `bookedBy` and `dispatcherUserId` filter options
- Dispatch-only users already have auto-filtering via `isDispatchOnly` check
- Individual mode will provide an explicit toggle for this behavior

### Reports Page (`/reports`)
- Uses `useReportsDateWindowAdapter()` which groups reports by dispatcher and office
- Filters are managed in `useReportsFilters.ts` with debounced search
- `useAutoSwitchOffice.ts` handles DB lookups for cross-office searches
- Individual mode will filter `groupedReports` to show only the current user's drivers

### Sidebar
- Already has a dark mode toggle pattern with `Switch` component
- Renders navigation filtered by role
- Individual mode toggle will follow the same pattern

---

## Implementation Steps

### Step 1: Database Migration

Add `individual_mode` column to the `profiles` table:

```sql
-- Add individual_mode column
ALTER TABLE profiles 
ADD COLUMN IF NOT EXISTS individual_mode boolean DEFAULT false;

-- Partial index for performance (only indexes rows where individual_mode = true)
CREATE INDEX IF NOT EXISTS idx_profiles_individual_mode 
ON profiles(individual_mode) 
WHERE individual_mode = true;

-- Comment for documentation
COMMENT ON COLUMN profiles.individual_mode IS 
'When true, dispatcher sees only their own booked orders and dispatched drivers';
```

**RLS consideration**: The existing `profiles` RLS policies should already allow users to update their own rows. If not, we'll add a policy.

---

### Step 2: Update TypeScript Types

Update `UserProfile` interface in `src/hooks/useAuth.ts`:

```typescript
export interface UserProfile {
  id: string;
  user_id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  office: string | null;
  individual_mode?: boolean;  // NEW
}
```

---

### Step 3: Create Individual Mode Context

Create new file `src/contexts/IndividualModeContext.tsx`:

**Purpose**: Provide a global state for individual mode that:
- Loads the setting from the user's profile
- Persists changes to the database
- Only allows dispatchers to use the feature (not admins/managers)
- Provides zero overhead when mode is OFF

**Key logic**:
- `canUseIndividualMode`: Only `dispatch` or `afterhours` primary roles can toggle
- `individualMode`: Returns false for non-eligible users
- `setIndividualMode()`: Updates database and local state

---

### Step 4: Wrap App with Provider

Update `src/App.tsx` to include the new provider:

```typescript
import { IndividualModeProvider } from '@/contexts/IndividualModeContext';

// Inside App component, wrap after AuthProvider:
<AuthProvider>
  <IndividualModeProvider>
    {/* rest of app */}
  </IndividualModeProvider>
</AuthProvider>
```

---

### Step 5: Add Sidebar Toggle

Update `src/components/Sidebar.tsx`:

**Location**: Add between the navigation menu and the dark mode toggle section

**UI**:
- Icon: `User` from lucide-react
- Label: "Individual"
- Switch component matching dark mode toggle style
- Only visible when `canUseIndividualMode` is true

---

### Step 6: Update Orders Page

Update `src/pages/Orders.tsx`:

**Current logic** (lines 158-175):
```typescript
const isDispatchOnly = hasRole("dispatch") && !hasRole("admin") && ...;
const orderFilterOptions = isDispatchOnly 
  ? { bookedBy: profile?.full_name || null, dispatcherUserId: profile?.user_id || null } 
  : { bookedBy: null, dispatcherUserId: null };
```

**New logic**:
```typescript
import { useIndividualMode } from '@/contexts/IndividualModeContext';

const { individualMode } = useIndividualMode();

// Apply filtering based on Individual mode
const orderFilterOptions = individualMode
  ? { bookedBy: profile?.full_name || null, dispatcherUserId: profile?.user_id || null }
  : { bookedBy: null, dispatcherUserId: null };
```

**Performance impact**: Zero when `individualMode = false` - just one boolean check

---

### Step 7: Update Reports Page Filtering

Update `src/hooks/useReportsDateWindowAdapter.ts`:

**Add early return for Individual mode filtering**:

```typescript
import { useIndividualMode } from '@/contexts/IndividualModeContext';

export const useReportsDateWindowAdapter = (options) => {
  const { individualMode } = useIndividualMode();
  const { profile } = useAuthContext();
  
  // ... existing date window logic ...
  
  // CRITICAL: Early return when Individual mode is OFF - zero overhead
  if (!individualMode) {
    return transformedData;
  }
  
  // Individual mode: filter to show only user's own drivers
  const filteredGroupedReports = transformedData.groupedReports?.filter(
    group => group.dispatcherId === profile?.user_id
  );
  
  return {
    ...transformedData,
    groupedReports: filteredGroupedReports,
  };
};
```

---

### Step 8: Update Reports Search Behavior

Update `src/hooks/useAutoSwitchOffice.ts`:

**When Individual mode is ON**:
- Use 600ms debounce instead of 300ms (gives user time to type full search)
- On search match: show the matched dispatcher(s) even if not the current user
- On clear search: return to showing only user's own data (not all office data)

```typescript
import { useIndividualMode } from '@/contexts/IndividualModeContext';

export function useAutoSwitchOffice({ ... }) {
  const { individualMode } = useIndividualMode();
  
  // Different debounce based on mode
  const debounceDelay = individualMode ? 600 : 300;
  const debouncedTruckDriver = useDebounce(truckDriverFilter, debounceDelay);
  
  // ... rest of logic ...
}
```

---

## Files to Create

| File | Purpose |
|------|---------|
| `src/contexts/IndividualModeContext.tsx` | Context provider for individual mode state |

## Files to Modify

| File | Changes |
|------|---------|
| `src/hooks/useAuth.ts` | Add `individual_mode` to `UserProfile` interface |
| `src/App.tsx` | Wrap with `IndividualModeProvider` |
| `src/components/Sidebar.tsx` | Add Individual mode toggle UI |
| `src/pages/Orders.tsx` | Use `individualMode` for filtering |
| `src/hooks/useReportsDateWindowAdapter.ts` | Filter groupedReports in Individual mode |
| `src/hooks/useAutoSwitchOffice.ts` | Adjust debounce and clear behavior |

---

## Performance Guarantees

| Component | When OFF | When ON |
|-----------|----------|---------|
| Orders | 1 boolean check (~0ms) | Normal filter applied |
| Reports | Early return (~0ms) | Array filter on groupedReports |
| Search | 300ms debounce | 600ms debounce |
| Fleets | No code changes | No code changes |

---

## Testing Plan

1. **Toggle visibility**: Verify toggle only shows for dispatch/afterhours roles
2. **Persistence**: Toggle state persists in database across page refreshes
3. **Orders page**: Individual ON shows only user's orders; OFF shows all
4. **Reports page**: Individual ON shows only user's drivers; OFF shows all
5. **Search behavior**: Search works in both modes, clear returns to appropriate view
6. **Performance**: Confirm no lag when Individual mode is OFF
