
-- Add eta_time column to transfer_list
ALTER TABLE public.transfer_list
ADD COLUMN eta_time text DEFAULT NULL;

-- Update the trigger to also protect eta_time for non-dispatch users
-- (dispatch and admin CAN edit eta_time, same as coming_to_office / driver_informed)
CREATE OR REPLACE FUNCTION public.restrict_dispatcher_transfer_list_updates()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    NEW.drug_test_zip := OLD.drug_test_zip;
    NEW.created_by := OLD.created_by;
    NEW.created_at := OLD.created_at;
  END IF;

  RETURN NEW;
END;
$function$;
