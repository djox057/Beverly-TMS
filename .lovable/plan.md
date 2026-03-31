

# Transfer List Page

## Overview
New page at `/transfer-list` showing an Excel-style table of driver/truck transfers between companies. All authenticated users can view it. Admin, manager, and safety roles can add rows and edit all fields. **Dispatchers can see only rows for their own trucks/drivers and can toggle the "Driver Informed" column.**

## Database

### Migration: Create `transfer_list` table
```sql
CREATE TABLE public.transfer_list (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid REFERENCES public.drivers(id) ON DELETE SET NULL,
  truck_id uuid REFERENCES public.trucks(id) ON DELETE SET NULL,
  going_to_company text,
  drug_test_date date,
  coming_to_office text,
  driver_informed boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.transfer_list ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read
CREATE POLICY "Authenticated users can view transfer_list"
  ON public.transfer_list FOR SELECT TO authenticated
  USING (true);

-- Admin/manager/safety can insert
CREATE POLICY "Admin/manager/safety can insert transfer_list"
  ON public.transfer_list FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(ARRAY['admin'::app_role, 'manager'::app_role, 'safety'::app_role]));

-- Admin/manager/safety can update all fields
CREATE POLICY "Admin/manager/safety can update transfer_list"
  ON public.transfer_list FOR UPDATE TO authenticated
  USING (public.has_any_role(ARRAY['admin'::app_role, 'manager'::app_role, 'safety'::app_role]));

-- Dispatchers can update only driver_informed (enforced via trigger below)
CREATE POLICY "Dispatchers can update driver_informed"
  ON public.transfer_list FOR UPDATE TO authenticated
  USING (public.has_any_role(ARRAY['dispatch'::app_role]));

-- Admin/manager/safety can delete
CREATE POLICY "Admin/manager/safety can delete transfer_list"
  ON public.transfer_list FOR DELETE TO authenticated
  USING (public.has_any_role(ARRAY['admin'::app_role, 'manager'::app_role, 'safety'::app_role]));

-- Trigger: restrict dispatchers to only changing driver_informed
CREATE OR REPLACE FUNCTION public.restrict_dispatcher_transfer_list_updates()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  user_roles app_role[];
BEGIN
  user_roles := public.auth_user_roles();
  IF 'dispatch'::app_role = ANY(user_roles)
     AND NOT user_roles && ARRAY['admin'::app_role, 'manager'::app_role, 'safety'::app_role]
  THEN
    NEW.driver_id := OLD.driver_id;
    NEW.truck_id := OLD.truck_id;
    NEW.going_to_company := OLD.going_to_company;
    NEW.drug_test_date := OLD.drug_test_date;
    NEW.coming_to_office := OLD.coming_to_office;
    NEW.created_by := OLD.created_by;
    NEW.created_at := OLD.created_at;
    -- Only driver_informed is allowed to change
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER restrict_dispatcher_transfer_list_updates
  BEFORE UPDATE ON public.transfer_list
  FOR EACH ROW EXECUTE FUNCTION public.restrict_dispatcher_transfer_list_updates();

-- Updated_at trigger
CREATE TRIGGER update_transfer_list_updated_at
  BEFORE UPDATE ON public.transfer_list
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
```

## Frontend

### 1. `src/pages/TransferList.tsx` (new file)
- Fetch all rows from `transfer_list` joined with `drivers(name)` and `trucks(truck_number, driver1_id)`
- **Dispatcher filtering**: if user has only `dispatch` role, filter client-side to show only rows where the driver's `dispatcher_id` matches `user.id` (using drivers data from the existing `useDrivers` hook)
- Excel-style table: Driver Name | Truck # | Going To Company | Drug Test Date | Coming To Office | Driver Informed (Yes/No checkbox)
- **Add Row**: button visible only to admin/manager/safety; opens inline row or small dialog with:
  - Truck combobox (auto-fills driver) and Driver combobox (auto-fills truck) using existing trucks/drivers data
  - Going to company (text or combobox from `useCompanies`)
  - Drug test date picker
  - Coming to office text input
- **Editing**:
  - Admin/manager/safety: all fields editable inline
  - Dispatch: only "Driver Informed" toggle is editable
  - Other roles: read-only
- **Summary widget**: top-right card showing count of trucks per destination company (grouped by `going_to_company`)
- **Delete**: admin/manager/safety can delete rows (with confirmation)

### 2. `src/components/Sidebar.tsx`
- Add `{ name: "Transfer List", href: "/transfer-list", icon: Users }` to the navigation array (no role restriction)

### 3. `src/App.tsx`
- Add route: `/transfer-list` -> `<ProtectedRoute><Layout><TransferList /></Layout></ProtectedRoute>`
- Import `TransferList` from `@/pages/TransferList`

## Technical Details
- Auto-fill: when user selects a truck, look up `driver1_id` from trucks data and set driver. When user selects a driver, find the truck where `driver1_id` matches and set truck.
- Dispatcher filtering uses `drivers` data to check `dispatcher_id === user.id` for each row's `driver_id`.
- The BEFORE UPDATE trigger ensures dispatchers can only modify `driver_informed` even if they bypass the UI.

