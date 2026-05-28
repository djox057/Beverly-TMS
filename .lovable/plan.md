# BG Loads page

A duplicate of the existing **Loads** page (`/orders` → `src/pages/Orders.tsx`), pre-filtered to the "BG" booking entity. Same data source, same table, same actions — just scoped.

## What to copy

Only **one** file needs to be copied. Everything else (hooks, dialogs, helpers, edge functions, filters, exports) is reused as-is.

1. **`src/pages/Orders.tsx` → `src/pages/BgLoads.tsx`**
   - Rename the component `Orders` → `BgLoads`.
   - Force the company filter to "BG" on mount and hide the "Company" dropdown so it can't be changed.
   - Change page title/heading from "Loads" to "BG Loads".
   - Persist filter state under a different localStorage key (e.g. `orders-filters-bg`) so it doesn't clobber the main Loads page state.

No new hooks, no new edge functions, no schema changes. `useOrders` already supports filtering and the existing `companyFilter` logic does the work.

## Wire-up

2. **`src/App.tsx`** — add route:
   ```tsx
   <Route path="/bg-loads" element={
     <ProtectedRoute><Layout><BgLoads /></Layout></ProtectedRoute>
   } />
   ```

3. **`src/components/Sidebar.tsx`** — add entry right under "Loads":
   ```ts
   { name: "BG Loads", href: "/bg-loads", icon: FileText }
   ```
   Add any role restriction you want (defaults to same visibility as Loads).

## Open question

Which company in the **Booking Company** filter represents BG? Possible candidates from the schema are the `companies` table entries — confirm the exact `companies.name` value (e.g. "BG Logistics", "BG Trucking", etc.) so the forced filter matches exactly. If BG isn't a booking company but instead a **truck company** (load-number suffix), let me know and I'll force `truckCompanyFilter` instead.

## Out of scope

- No changes to `useOrders`, edge functions, or the database.
- No changes to the existing `/orders` page behavior.
- No new permissions/roles — uses the standard ProtectedRoute.
