
# Plan: Fix UUID Display in EFS Requests "Requested By" Column

## Problem
In the EFS Requests page, some rows (especially Cash Advances) show a raw UUID like `d1d1a67e-2d6b-4cc1-a0b7-4c938bcc371b` in the "Requested By" column instead of the user's name.

## Root Cause
The current code has this fallback logic:
```typescript
requested_by_name: item.requested_by ? userNameMap[item.requested_by] || item.requested_by : null
```

When a user's profile isn't found in the `userNameMap` (due to RLS restrictions or missing data), it falls back to displaying the raw UUID instead of a user-friendly placeholder.

## Solution
Update the fallback logic to show `null` (which renders as "-") instead of the raw UUID when the profile name cannot be resolved.

## File Changes

### `src/pages/EfsRequests.tsx`

**Lines 136 and 154** - Change the fallback from showing UUID to showing null:

**Before:**
```typescript
// Line 136 (EFS requests)
requested_by_name: item.requested_by ? userNameMap[item.requested_by] || item.requested_by : null,

// Line 154 (Cash advances)  
requested_by_name: item.requested_by ? userNameMap[item.requested_by] || item.requested_by : null,
```

**After:**
```typescript
// Line 136 (EFS requests)
requested_by_name: item.requested_by ? userNameMap[item.requested_by] || null : null,

// Line 154 (Cash advances)
requested_by_name: item.requested_by ? userNameMap[item.requested_by] || null : null,
```

## Summary
This is a simple two-line fix that changes `|| item.requested_by` to `|| null` in both locations. This ensures that when a profile can't be found, the UI shows "-" instead of a confusing UUID string.

## Technical Details
- The `profiles` table has RLS policies that may restrict which profiles certain users can see
- Rather than modifying RLS policies (which could have security implications), we simply handle the "profile not found" case gracefully in the UI
- The "-" display is consistent with how other missing data is shown in the table (like empty truck numbers or locations)
