# Trucks: "Changed" status filter

Add a fourth option, **Changed**, to the Status dropdown on the Trucks page. It shows trucks whose driver assignment (driver 1 or driver 2) changed in the last 14 days — swaps, new assignments, and removals all count.

## Example

Assignment history already records these (real recent rows):

- Truck **5362** — Gregory Nwele removed, then Basile Mbah assigned (Sep 1) → shows as Changed (a swap)
- Truck **03199** — Robert Bolton replaced by Dytwan Haynes (Sep 1) → shows as Changed
- Truck **6726** — Esteban Vale newly assigned to an empty truck (Sep 1) → shows as Changed
- Truck **0901** — Michael Olds removed, truck now empty (Sep 1) → shows as Changed
- A truck with no driver movement since mid-August → not shown

Note that unassign-then-reassign is stored as two separate rows; the filter treats the truck as changed either way, so no de-duplication logic is needed.

## Behavior

- Dropdown options become: Active, Inactive, OOS, **Changed**, All Status.
- "Changed" filters the truck list to that set only; the search box, Company filter, and Assignment filter keep working on top of it, and pagination resets to page 1 like the other options.
- Inactive/terminated trucks are excluded from "Changed" so the view stays operational.

## Technical notes

- New hook `src/hooks/useChangedTrucks.ts`: queries `assignment_history` for rows with `truck_id not null`, `changed_at >= now() - 14 days`, where `old_driver1_id` differs from `driver1_id` or `old_driver2_id` differs from `driver2_id`, and returns a `Set<truck_id>`. Cached via react-query with a short stale time; only enabled while the filter is set to `changed`.
- `src/pages/Trucks.tsx`: add `{ value: "changed", label: "Changed" }` to the Status `Combobox` options, and extend the `matchesStatus` branch in the `filteredTrucks` memo with `(statusFilter === "changed" && changedTruckIds.has(truck.id) && truck.is_active !== false)`. Add the id set to the memo dependencies.
- No database migration or schema change required — `assignment_history` already holds the old/new driver columns and is readable by the app.
