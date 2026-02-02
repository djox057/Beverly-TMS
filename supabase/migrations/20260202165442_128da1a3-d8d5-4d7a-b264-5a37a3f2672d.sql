-- Drop and recreate get_assignment_history with new return type
DROP FUNCTION IF EXISTS public.get_assignment_history(text, uuid, timestamp with time zone, timestamp with time zone, integer);
DROP FUNCTION IF EXISTS public.get_assignment_history(text, uuid);

CREATE OR REPLACE FUNCTION public.get_assignment_history(
  p_entity_type text, p_entity_id uuid, 
  p_from_date timestamp with time zone DEFAULT NULL, 
  p_to_date timestamp with time zone DEFAULT NULL, 
  p_limit integer DEFAULT 100
)
RETURNS TABLE(
  id uuid, truck_id uuid, trailer_id uuid, driver1_id uuid, driver2_id uuid,
  old_truck_id uuid, old_trailer_id uuid, old_driver1_id uuid, old_driver2_id uuid,
  changed_at timestamp with time zone, changed_by uuid, change_type text,
  truck_number text, trailer_number text, driver1_name text, driver2_name text,
  changed_by_name text, reason text,
  old_truck_number text, old_trailer_number text, old_driver1_name text, old_driver2_name text,
  dispatcher_id uuid, old_dispatcher_id uuid, dispatcher_name text, old_dispatcher_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    ah.id, ah.truck_id, ah.trailer_id, ah.driver1_id, ah.driver2_id,
    ah.old_truck_id, ah.old_trailer_id, ah.old_driver1_id, ah.old_driver2_id,
    ah.changed_at, ah.changed_by, ah.change_type,
    t.truck_number, tr.trailer_number, d1.name, d2.name,
    p.full_name, ah.reason,
    old_t.truck_number, old_tr.trailer_number, old_d1.name, old_d2.name,
    ah.dispatcher_id, ah.old_dispatcher_id, disp.full_name, old_disp.full_name
  FROM assignment_history ah
  LEFT JOIN trucks t ON ah.truck_id = t.id
  LEFT JOIN trailers tr ON ah.trailer_id = tr.id
  LEFT JOIN drivers d1 ON ah.driver1_id = d1.id
  LEFT JOIN drivers d2 ON ah.driver2_id = d2.id
  LEFT JOIN profiles p ON ah.changed_by = p.user_id
  LEFT JOIN trucks old_t ON ah.old_truck_id = old_t.id
  LEFT JOIN trailers old_tr ON ah.old_trailer_id = old_tr.id
  LEFT JOIN drivers old_d1 ON ah.old_driver1_id = old_d1.id
  LEFT JOIN drivers old_d2 ON ah.old_driver2_id = old_d2.id
  LEFT JOIN profiles disp ON ah.dispatcher_id = disp.user_id
  LEFT JOIN profiles old_disp ON ah.old_dispatcher_id = old_disp.user_id
  WHERE 
    CASE 
      WHEN p_entity_type = 'truck' THEN ah.truck_id = p_entity_id OR ah.old_truck_id = p_entity_id
      WHEN p_entity_type = 'trailer' THEN ah.trailer_id = p_entity_id OR ah.old_trailer_id = p_entity_id
      WHEN p_entity_type = 'driver' THEN (
        ah.driver1_id = p_entity_id OR ah.driver2_id = p_entity_id OR
        ah.old_driver1_id = p_entity_id OR ah.old_driver2_id = p_entity_id
      )
      ELSE false
    END
    AND (p_from_date IS NULL OR ah.changed_at >= p_from_date)
    AND (p_to_date IS NULL OR ah.changed_at <= p_to_date)
  ORDER BY ah.changed_at DESC, ah.id DESC
  LIMIT p_limit;
END;
$function$;