

## Plan: Afterhours Driver Assignments

### Problem
Weekend/afterhours dispatchers need a separate assignment of drivers/trucks that is independent from the regular dispatcher-driver assignments. Currently, drivers are assigned to dispatchers via `drivers.dispatcher_id`. The afterhours assignment needs its own storage and UI.

### Database

**New table: `afterhours_assignments`**
```sql
CREATE TABLE public.afterhours_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  afterhours_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  driver_id uuid NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (afterhours_user_id, driver_id)
);

ALTER TABLE public.afterhours_assignments ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read
CREATE POLICY "Authenticated users can read afterhours assignments"
ON public.afterhours_assignments FOR SELECT TO authenticated USING (true);

-- Admin/manager can manage
CREATE POLICY "Admin/manager can manage afterhours assignments"
ON public.afterhours_assignments FOR ALL TO authenticated
USING (public.has_any_role(ARRAY['admin'::app_role, 'manager'::app_role]))
WITH CHECK (public.has_any_role(ARRAY['admin'::app_role, 'manager'::app_role]));
```

### Frontend Changes

**1. New hook: `src/hooks/useAfterhoursAssignments.ts`**
- Fetch all rows from `afterhours_assignments`
- Fetch users with `afterhours` role from `user_roles` + their profiles (office, name)
- Fetch all active drivers with truck info (reuse pattern from `useFleetManagement`)
- Provide `assignDriver(afterhoursUserId, driverId)` and `removeDriver(afterhoursUserId, driverId)` mutations
- Group drivers by afterhours user, grouped by office

**2. New component: `src/components/AfterhoursFleetTab.tsx`**
- Renders inside the Fleets page as a new tab "Afterhours"
- Shows afterhours users grouped by office (same layout as dispatcher fleet cards)
- Each card shows the afterhours user's name and their assigned drivers/trucks
- "Assign Driver" button opens a combobox to pick from all active drivers (drivers can be assigned to multiple afterhours users since this is independent)
- "Remove" button to unassign a driver
- Read-only for non-admin/manager users

**3. Modified file: `src/pages/Fleets.tsx`**
- Add a third tab "Afterhours" to the existing Tabs component (alongside "Dispatchers" and "Supervisors")
- Import and render `AfterhoursFleetTab` inside the new TabsContent
- Change `grid-cols-2` to `grid-cols-3` on TabsList

### What this does NOT change
- No changes to existing `drivers.dispatcher_id` assignments
- No changes to order creation permissions (afterhours users already have access)
- No changes to the afterhours schedule dialog or role-switching cron

