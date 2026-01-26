
# Fix: Reports Page Not Loading Data for Different Offices

## Problem Identified

When users switch between office tabs (e.g., Čačak → KRAGUJEVAC → BEOGRAD), the Reports page continues showing data from their original office. This happens because the adapter's React Query cache keys are not scoped by office.

## Root Cause

In `src/hooks/useReportsDateWindowAdapter.ts`, the child queries that fetch supporting data (trucks, drivers, truck notes, lost day notes) use **static query keys** that don't include the `priorityOffice` parameter:

```text
Current (Broken):
├── ["adapter-trucks"]           ← Same key for ALL offices
├── ["adapter-drivers"]          ← Same key for ALL offices
├── ["adapter-truck-notes"]      ← Same key for ALL offices
└── ["adapter-lost-day-notes"]   ← Same key for ALL offices
```

When the user switches tabs:
1. `useReportsDateWindow` correctly refetches (its key includes `priorityOffice`)
2. It returns new `driverIds` for the new office
3. **BUT** the adapter queries return stale cached data because their keys didn't change

## Solution

Add `priorityOffice` to all adapter query keys so React Query treats each office as a separate cache entry:

```text
Fixed:
├── ["adapter-trucks", "Čačak"]
├── ["adapter-drivers", "Čačak"]
├── ["adapter-truck-notes", "Čačak"]
└── ["adapter-lost-day-notes", "Čačak"]
```

---

## Technical Changes

### File: `src/hooks/useReportsDateWindowAdapter.ts`

**1. Update trucks query key (line 175)**
- Change from: `queryKey: ["adapter-trucks"]`
- Change to: `queryKey: ["adapter-trucks", priorityOffice]`

**2. Update drivers query key (line 215)**
- Change from: `queryKey: ["adapter-drivers"]`
- Change to: `queryKey: ["adapter-drivers", priorityOffice]`

**3. Update truck notes query key (line 270)**
- Change from: `queryKey: ["adapter-truck-notes"]`
- Change to: `queryKey: ["adapter-truck-notes", priorityOffice]`

**4. Update lost day notes query key (line 280)**
- Change from: `queryKey: ["adapter-lost-day-notes"]`
- Change to: `queryKey: ["adapter-lost-day-notes", priorityOffice]`

---

## Why This Happens

React Query uses the query key as a cache identifier. Without the office in the key:

| User Action | Expected | Actual (Bug) |
|-------------|----------|--------------|
| Loads Čačak tab | Fetch Čačak drivers | ✅ Fetches correctly |
| Switches to KRAGUJEVAC | Fetch KRAGUJEVAC drivers | ❌ Returns cached Čačak data |
| Switches to BEOGRAD | Fetch BEOGRAD drivers | ❌ Returns cached Čačak data |

With the fix, each office tab triggers fresh queries with unique cache entries.

---

## Testing Checklist

After the fix:
1. Log in as a dispatcher assigned to Čačak office
2. Verify Čačak data loads correctly on initial page load
3. Switch to KRAGUJEVAC tab → should see KRAGUJEVAC dispatchers/drivers
4. Switch to BEOGRAD tab → should see BEOGRAD dispatchers/drivers
5. Switch to Recovery tab → should see Recovery dispatchers/drivers
6. Switch back to Čačak → should show Čačak data (now from cache)
