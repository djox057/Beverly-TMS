
-- Allow dispatchers to update drivers (column restrictions enforced by trigger below)
CREATE POLICY "Dispatchers can update driver qualifications"
ON public.drivers FOR UPDATE
USING (has_role(auth.uid(), 'dispatch'::app_role))
WITH CHECK (has_role(auth.uid(), 'dispatch'::app_role));

-- Trigger to restrict dispatchers to only updating qualification fields
CREATE OR REPLACE FUNCTION public.restrict_dispatcher_driver_updates()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  user_roles app_role[];
BEGIN
  user_roles := public.auth_user_roles();

  -- Only restrict dispatchers who don't also have admin/manager/accounting/safety/supervisor roles
  IF 'dispatch'::app_role = ANY(user_roles)
     AND NOT user_roles && ARRAY['admin'::app_role, 'manager'::app_role, 'accounting'::app_role, 'safety'::app_role, 'supervisor'::app_role]
  THEN
    -- Revert all fields except the allowed qualification fields
    NEW.first_name := OLD.first_name;
    NEW.last_name := OLD.last_name;
    NEW.name := OLD.name;
    NEW.phone := OLD.phone;
    NEW.email := OLD.email;
    NEW.company_id := OLD.company_id;
    NEW.dispatcher_id := OLD.dispatcher_id;
    NEW.is_active := OLD.is_active;
    NEW.is_company_driver := OLD.is_company_driver;
    NEW.cents_per_mile := OLD.cents_per_mile;
    NEW.weekly_payment := OLD.weekly_payment;
    NEW.weeks_count := OLD.weeks_count;
    NEW.home_address := OLD.home_address;
    NEW.home_city := OLD.home_city;
    NEW.home_state := OLD.home_state;
    NEW.home_latitude := OLD.home_latitude;
    NEW.home_longitude := OLD.home_longitude;
    NEW.hire_date := OLD.hire_date;
    NEW.termination_date := OLD.termination_date;
    NEW.two_week_block_date := OLD.two_week_block_date;
    NEW.cdl_number := OLD.cdl_number;
    NEW.cdl_expiration_date := OLD.cdl_expiration_date;
    NEW.license_number := OLD.license_number;
    NEW.medical_card_expiration_date := OLD.medical_card_expiration_date;
    NEW.mvr_date := OLD.mvr_date;
    NEW.random_drug_test_date := OLD.random_drug_test_date;
    NEW.clearing_house := OLD.clearing_house;
    NEW.agreement_start_date := OLD.agreement_start_date;
    NEW.mc_number := OLD.mc_number;
    NEW.company_name := OLD.company_name;
    NEW.company_address := OLD.company_address;
    NEW.emergency_contact_name := OLD.emergency_contact_name;
    NEW.emergency_contact_phone := OLD.emergency_contact_phone;
    NEW.emergency_contact_relation := OLD.emergency_contact_relation;
    NEW.going_yard := OLD.going_yard;
    NEW.is_recovery := OLD.is_recovery;
    NEW.is_checked_for_termination := OLD.is_checked_for_termination;
    -- Allow: do_not_touch_hos, hazmat, tanker, twic, citizen, criminal, straps, load_bars
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER restrict_dispatcher_driver_updates_trigger
BEFORE UPDATE ON public.drivers
FOR EACH ROW
EXECUTE FUNCTION public.restrict_dispatcher_driver_updates();
