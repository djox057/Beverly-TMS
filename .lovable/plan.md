

## Make Driver Name Clickable in Reports Info Popover

### What
In the Reports page driver info popover (the ℹ️ icon), clicking a driver name (e.g., "Cody Mcadams") should open the `EditDriverDialog` for that driver.

### Changes in `src/pages/Reports.tsx`

1. **Add state for EditDriverDialog** — two new state variables:
   - `editDriverDialogOpen: boolean`
   - `editingDriverId: string | null`

2. **Import and use `useDrivers`** — needed to look up the full driver object by ID (EditDriverDialog expects the full driver record). The hook is already cached so no extra fetch.

3. **Import `EditDriverDialog`** component.

4. **Make driver names clickable** — In three places within the info popover:
   - **Line ~4202**: Team driver 1 name (`Driver 1: {truck.driver1Name}`) — wrap in a clickable `<span>` that sets `editingDriverId` to `truck.driverId`.
   - **Line ~4362**: Team driver 2 name (`Driver 2: {truck.driver2Name}`) — wrap in a clickable `<span>` that sets `editingDriverId` to `truck.driver2Id`.
   - **Line ~4440**: Solo driver name (`{truck.driver}`) — wrap in a clickable `<span>` that sets `editingDriverId` to `truck.driverId`.

   Each clickable name gets `className="text-primary hover:underline cursor-pointer"` styling and an `onClick` handler that sets the editing state.

5. **Render `EditDriverDialog`** at the bottom of the component, passing the driver object found via `allDrivers?.find(d => d.id === editingDriverId)`.

### Pattern Reference
This follows the exact same pattern used in `YardArrivals.tsx` (lines 436-442, 1248-1254).

