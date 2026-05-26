ALTER TABLE public.recruiter_salary_payments
  ADD COLUMN IF NOT EXISTS extra_day_dates date[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS lost_day_dates date[] NOT NULL DEFAULT '{}';