-- Drop and recreate the get_assignment_history function to include the reason column
DROP FUNCTION IF EXISTS public.get_assignment_history(text, uuid);

CREATE OR REPLACE FUNCTION public.get_assignment_history(p_entity_type text, p_entity_id uuid)
 RETURNS TABLE(id uuid, truck_id uuid, trailer_id uuid, driver1_id uuid, driver2_id uuid, changed_at timestamp with time zone, changed_by uuid, change_type text, truck_number text, trailer_number text, driver1_name text, driver2_name text, changed_by_name text, reason text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    ah.id,
    ah.truck_id,
    ah.trailer_id,
    ah.driver1_id,
    ah.driver2_id,
    ah.changed_at,
    ah.changed_by,
    ah.change_type,
    t.truck_number,
    tr.trailer_number,
    d1.name as driver1_name,
    d2.name as driver2_name,
    NULL::text as changed_by_name,
    ah.reason
  FROM assignment_history ah
  LEFT JOIN trucks t ON ah.truck_id = t.id
  LEFT JOIN trailers tr ON ah.trailer_id = tr.id
  LEFT JOIN drivers d1 ON ah.driver1_id = d1.id
  LEFT JOIN drivers d2 ON ah.driver2_id = d2.id
  WHERE 
    CASE 
      WHEN p_entity_type = 'truck' THEN ah.truck_id = p_entity_id
      WHEN p_entity_type = 'trailer' THEN ah.trailer_id = p_entity_id
      WHEN p_entity_type = 'driver' THEN (ah.driver1_id = p_entity_id OR ah.driver2_id = p_entity_id)
      ELSE false
    END
  ORDER BY ah.changed_at DESC
  LIMIT 50;
END;
$function$;