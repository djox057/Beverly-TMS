
ALTER TABLE public.dispatcher_salary_payments 
ADD COLUMN IF NOT EXISTS lost_days integer DEFAULT NULL;

COMMENT ON COLUMN public.dispatcher_salary_payments.lost_days IS 'Manual override for lost days count. When set, overrides the count from dispatcher_off_duty_days table.';
