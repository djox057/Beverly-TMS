-- Create transfer_list table
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

CREATE POLICY "Authenticated users can view transfer_list"
  ON public.transfer_list FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Admin/manager/safety can insert transfer_list"
  ON public.transfer_list FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(ARRAY['admin'::app_role, 'manager'::app_role, 'safety'::app_role]));

CREATE POLICY "Admin/manager/safety can update transfer_list"
  ON public.transfer_list FOR UPDATE TO authenticated
  USING (public.has_any_role(ARRAY['admin'::app_role, 'manager'::app_role, 'safety'::app_role]));

CREATE POLICY "Dispatchers can update driver_informed"
  ON public.transfer_list FOR UPDATE TO authenticated
  USING (public.has_any_role(ARRAY['dispatch'::app_role]));

CREATE POLICY "Admin/manager/safety can delete transfer_list"
  ON public.transfer_list FOR DELETE TO authenticated
  USING (public.has_any_role(ARRAY['admin'::app_role, 'manager'::app_role, 'safety'::app_role]));

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
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER restrict_dispatcher_transfer_list_updates
  BEFORE UPDATE ON public.transfer_list
  FOR EACH ROW EXECUTE FUNCTION public.restrict_dispatcher_transfer_list_updates();

CREATE TRIGGER update_transfer_list_updated_at
  BEFORE UPDATE ON public.transfer_list
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();