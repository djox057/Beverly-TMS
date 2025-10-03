-- Fix the Security Definer View issue
-- Recreate the drivers_public view without security definer
DROP VIEW IF EXISTS public.drivers_public;

CREATE VIEW public.drivers_public AS
SELECT 
  id,
  name,
  email,
  phone,
  hire_date,
  termination_date,
  is_active,
  cdl_number,
  cdl_expiration_date,
  medical_card_expiration_date,
  mvr_date,
  clearing_house,
  license_number,
  fuel_card_number,
  personal_id,
  hos_status,
  hos_drive_minutes,
  hos_shift_minutes,
  hos_cycle_minutes,
  hos_break_minutes,
  hos_last_updated,
  home_city,
  home_state,
  created_at,
  updated_at
FROM public.drivers
WHERE 
  -- Only show drivers to authorized users
  (
    has_role(auth.uid(), 'dispatch'::app_role) OR 
    has_role(auth.uid(), 'manager'::app_role) OR 
    has_role(auth.uid(), 'admin'::app_role)
  );

GRANT SELECT ON public.drivers_public TO authenticated;