CREATE TABLE public.recruiting_driver_expense_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL DEFAULT gen_random_uuid(),
  source_id uuid,
  recruiter text,
  recruiter_id uuid,
  driver_name text NOT NULL DEFAULT '',
  truck_number text,
  expense_type text NOT NULL DEFAULT 'other',
  amount numeric,
  expense_date date,
  details text,
  nights integer,
  card text,
  airline text,
  status text,
  is_paid boolean NOT NULL DEFAULT false,
  payment_notes text,
  notice text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.recruiting_driver_expense_lines TO authenticated;
GRANT ALL ON public.recruiting_driver_expense_lines TO service_role;

ALTER TABLE public.recruiting_driver_expense_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View recruiting expense lines"
ON public.recruiting_driver_expense_lines FOR SELECT TO authenticated
USING (public.has_any_role(ARRAY['admin','manager','recruiting','chicago_management']::app_role[]));

CREATE POLICY "Insert recruiting expense lines"
ON public.recruiting_driver_expense_lines FOR INSERT TO authenticated
WITH CHECK (public.has_any_role(ARRAY['admin','manager','recruiting']::app_role[]));

CREATE POLICY "Update recruiting expense lines"
ON public.recruiting_driver_expense_lines FOR UPDATE TO authenticated
USING (public.has_any_role(ARRAY['admin','manager','recruiting']::app_role[]))
WITH CHECK (public.has_any_role(ARRAY['admin','manager','recruiting']::app_role[]));

CREATE POLICY "Delete recruiting expense lines"
ON public.recruiting_driver_expense_lines FOR DELETE TO authenticated
USING (public.has_any_role(ARRAY['admin','manager','recruiting']::app_role[]));

CREATE INDEX idx_rdel_trip ON public.recruiting_driver_expense_lines (trip_id);
CREATE INDEX idx_rdel_date ON public.recruiting_driver_expense_lines (expense_date DESC);
CREATE INDEX idx_rdel_driver ON public.recruiting_driver_expense_lines (lower(driver_name));

CREATE TRIGGER trg_rdel_updated_at
BEFORE UPDATE ON public.recruiting_driver_expense_lines
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();