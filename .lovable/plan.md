## Plan

1. **Fix truck scope filtering**
   - Update `src/hooks/useReportsDateWindowAdapter.ts` so `filteredTrucks` includes active trucks that have no `driver1_id`/`driver2_id` but do have a stored `dispatcher_id` matching the currently viewed dispatcher/office scope.
   - Keep existing driver-based filtering unchanged for assigned trucks.

2. **Fetch needed dispatcher profiles**
   - Include dispatcher IDs found directly on filtered driverless trucks when building the `profiles` query.
   - This ensures the report group can be created even when the dispatcher has no active driver attached to that truck.

3. **Render driverless truck rows**
   - After normal driver rows are built, add rows for driverless trucks using:
     - `truck.truck_number`
     - stored `truck.dispatcher_id`
     - stored `truck.company_id`
     - trailer/truck maintenance fields as available
     - blank driver fields
     - no current load/order data unless later assigned through normal driver/order flow
   - Preserve existing report behavior for all driver-assigned trucks.

4. **Verify the specific case**
   - Confirm truck `7327` (the database row matching the screenshot and current data) appears under `Nemanja Jelisavcic-Thomas` with company `AP Silver Trans LLC` and an empty driver cell after refresh.

## Technical notes

- Confirmed in the database: truck `7327` is active, has no drivers, and has stored `dispatcher_id = 069b0875-5702-4da8-b476-e4c315463626` plus company `AP Silver Trans LLC`.
- Current adapter code still filters trucks only by `driver1_id`/`driver2_id`, so driverless trucks are excluded before rendering.