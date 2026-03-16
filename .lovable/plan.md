

# Add HOS API Raw Data Inspector Button to Admin Users

## Goal
Add a button on the Admin Users page that triggers a new edge function to fetch raw data from the Transit Tracking API and return the complete response, so you can see all available fields (including fuel level, location, etc.).

## Plan

### 1. Create new edge function `hos-api-inspect`
- **File**: `supabase/functions/hos-api-inspect/index.ts`
- Reuses the same auth flow as `hos-sync` (reads `TRANSIT_TRACKING_API_KEYS` and `TRANSIT_TRACKING_API_KEY_UNITED` secrets)
- Authenticates with each API key, fetches data from `assets/currentWithTimers?additionalInfo=true`
- Returns:
  - Total record count per API key
  - **All field names** (keys) from the first record of each key
  - **3 sample records** per API key (full JSON) so you can inspect every field
- Requires admin role (check JWT + user_roles)

### 2. Add button to `src/pages/AdminUsers.tsx`
- Add a "🔍 Inspect HOS API" button in the header area (next to existing action buttons)
- On click: calls `supabase.functions.invoke('hos-api-inspect')`
- Shows results in a dialog with:
  - List of all field names found
  - Scrollable JSON view of sample records
  - Per-key record counts

### Technical Details
- The edge function uses the same `AUTH_URL` and `API_URL` constants as `hos-sync`
- No database changes needed — this is read-only inspection
- Response is JSON with structure: `{ keys: [{ keyIndex, recordCount, fieldNames: string[], samples: object[] }] }`

