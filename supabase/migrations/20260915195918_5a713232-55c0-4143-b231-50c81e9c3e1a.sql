CREATE TABLE public.recruiting_driver_expenses (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  recruiter text,
  driver_name text NOT NULL DEFAULT '',
  ticket_price numeric(12,2),
  bag_amount numeric(12,2),
  card text,
  airline text,
  purchase_date date,
  arrival_date date,
  motel_nights integer,
  motel_amount numeric(12,2),
  truck_number text,
  uber_amount numeric(12,2),
  uber_destinations text,
  status text,
  payment_notes text,
  notice text,
  total_exp numeric(12,2) GENERATED ALWAYS AS (COALESCE(ticket_price,0)+COALESCE(bag_amount,0)+COALESCE(motel_amount,0)+COALESCE(uber_amount,0)) STORED,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.recruiting_driver_expenses TO authenticated;
GRANT ALL ON public.recruiting_driver_expenses TO service_role;

ALTER TABLE public.recruiting_driver_expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Recruiting staff can view driver expenses"
ON public.recruiting_driver_expenses FOR SELECT TO authenticated
USING (public.has_any_role(ARRAY['admin','manager','recruiting','chicago_management']::app_role[]));

CREATE POLICY "Recruiting staff can add driver expenses"
ON public.recruiting_driver_expenses FOR INSERT TO authenticated
WITH CHECK (public.has_any_role(ARRAY['admin','manager','recruiting']::app_role[]));

CREATE POLICY "Recruiting staff can edit driver expenses"
ON public.recruiting_driver_expenses FOR UPDATE TO authenticated
USING (public.has_any_role(ARRAY['admin','manager','recruiting']::app_role[]))
WITH CHECK (public.has_any_role(ARRAY['admin','manager','recruiting']::app_role[]));

CREATE POLICY "Recruiting staff can delete driver expenses"
ON public.recruiting_driver_expenses FOR DELETE TO authenticated
USING (public.has_any_role(ARRAY['admin','manager','recruiting']::app_role[]));

CREATE INDEX recruiting_driver_expenses_purchase_date_idx ON public.recruiting_driver_expenses (purchase_date DESC);
CREATE INDEX recruiting_driver_expenses_driver_name_idx ON public.recruiting_driver_expenses (lower(driver_name));

CREATE TRIGGER recruiting_driver_expenses_updated_at
BEFORE UPDATE ON public.recruiting_driver_expenses
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();