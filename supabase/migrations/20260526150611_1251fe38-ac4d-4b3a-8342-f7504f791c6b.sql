CREATE TABLE IF NOT EXISTS public.recruiter_salary_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  month text NOT NULL,
  base_salary numeric NOT NULL DEFAULT 0,
  extra_days integer NOT NULL DEFAULT 0,
  lost_days integer NOT NULL DEFAULT 0,
  with_card_days integer NOT NULL DEFAULT 0,
  without_card_days integer NOT NULL DEFAULT 0,
  food_allowance numeric NOT NULL DEFAULT 70,
  paid boolean NOT NULL DEFAULT false,
  paid_amount numeric,
  calculated_salary numeric,
  is_checked boolean NOT NULL DEFAULT false,
  recruiter_name text,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, month)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.recruiter_salary_payments TO authenticated;
GRANT ALL ON public.recruiter_salary_payments TO service_role;

ALTER TABLE public.recruiter_salary_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage recruiter salaries"
  ON public.recruiter_salary_payments
  FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE TRIGGER trg_recruiter_salary_payments_updated_at
  BEFORE UPDATE ON public.recruiter_salary_payments
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();