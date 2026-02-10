
## Fix: Samsara Duplicate Truck Resolution

### Problem
Truck 7347 exists in **both** Samsara accounts (API_KEY_1 and API_KEY_2). The current code picks the **first match** it finds, which may be a stale/old entry from one account showing Lynwood, IL instead of the real location in Sweetwater, TX.

### Root Cause
- The `vehicleByName` Map overwrites entries with the same name -- whichever Samsara account is processed last wins
- The `findMatchingVehicle` regex fallback returns the first match from the combined `allVehicles` array
- There is no logic to prefer the **most recent** location when duplicates exist

### Solution

**1. When duplicates exist across Samsara accounts, pick the one with the most recent location timestamp.**

In `supabase/functions/samsara-locations/index.ts`:

- Change the `vehicleByName` Map building to keep the entry with the **newest** location timestamp when a duplicate name is found
- Update `findMatchingVehicle` to collect **all** matches and return the one with the freshest location
- Add debug logging for truck 7347 specifically (temporary) so we can verify the fix

**2. Add `apiKeyIndex` to the response for diagnostics.**

Include `apiSource` in each location result so the UI/logs can show which Samsara account provided the data.

### Technical Details

```text
Current flow:
  API_KEY_1 vehicles --> allVehicles (first)
  API_KEY_2 vehicles --> allVehicles (appended)
  vehicleByName: last write wins (no freshness check)
  findMatchingVehicle: returns first match

Fixed flow:
  API_KEY_1 vehicles --> allVehicles (first)
  API_KEY_2 vehicles --> allVehicles (appended)
  vehicleByName: keeps entry with newest location.time
  findMatchingVehicle: if multiple matches, return freshest
```

Changes to `supabase/functions/samsara-locations/index.ts`:

- **Map building** (line 76-79): When inserting into `vehicleByName`, compare `location.time` timestamps and keep the newer one
- **findMatchingVehicle** function: For regex fallback paths, collect all candidates and return the one with the most recent timestamp
- **Response payload**: Add `apiSource` field (0 or 1) to each location for visibility
- **Diagnostic log**: Log all matches found for any truck that has duplicates across accounts, so you can verify correct resolution
