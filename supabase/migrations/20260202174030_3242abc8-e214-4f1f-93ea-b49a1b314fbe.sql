-- Fix the get_assignment_history function to join profiles on user_id for dispatcher names
CREATE OR REPLACE FUNCTION public.get_assignment_history(
  p_entity_type text, 
  p_entity_id uuid, 
  p_from_date timestamp with time zone DEFAULT NULL, 
  p_to_date timestamp with time zone DEFAULT NULL, 
  p_limit integer DEFAULT 100
)
RETURNS TABLE(
  id uuid, 
  truck_id uuid, 
  trailer_id uuid, 
  driver1_id uuid, 
  driver2_id uuid, 
  old_truck_id uuid, 
  old_trailer_id uuid, 
  old_driver1_id uuid, 
  old_driver2_id uuid, 
  dispatcher_id uuid, 
  old_dispatcher_id uuid, 
  changed_at timestamp with time zone, 
  changed_by uuid, 
  change_type text, 
  truck_number text, 
  trailer_number text, 
  driver1_name text, 
  driver2_name text, 
  changed_by_name text, 
  reason text, 
  old_truck_number text, 
  old_trailer_number text, 
  old_driver1_name text, 
  old_driver2_name text, 
  dispatcher_name text, 
  old_dispatcher_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ah.id,
    ah.truck_id,
    ah.trailer_id,
    ah.driver1_id,
    ah.driver2_id,
    ah.old_truck_id,
    ah.old_trailer_id,
    ah.old_driver1_id,
    ah.old_driver2_id,
    ah.dispatcher_id,
    ah.old_dispatcher_id,
    ah.changed_at,
    ah.changed_by,
    ah.change_type,
    t.truck_number::text,
    tr.trailer_number::text,
    d1.name::text AS driver1_name,
    d2.name::text AS driver2_name,
    p.full_name::text AS changed_by_name,
    ah.reason,
    old_t.truck_number::text AS old_truck_number,
    old_tr.trailer_number::text AS old_trailer_number,
    old_d1.name::text AS old_driver1_name,
    old_d2.name::text AS old_driver2_name,
    disp.full_name::text AS dispatcher_name,
    old_disp.full_name::text AS old_dispatcher_name
  FROM assignment_history ah
  LEFT JOIN trucks t ON t.id = ah.truck_id
  LEFT JOIN trailers tr ON tr.id = ah.trailer_id
  LEFT JOIN drivers d1 ON d1.id = ah.driver1_id
  LEFT JOIN drivers d2 ON d2.id = ah.driver2_id
  LEFT JOIN profiles p ON p.user_id = ah.changed_by
  LEFT JOIN trucks old_t ON old_t.id = ah.old_truck_id
  LEFT JOIN trailers old_tr ON old_tr.id = ah.old_trailer_id
  LEFT JOIN drivers old_d1 ON old_d1.id = ah.old_driver1_id
  LEFT JOIN drivers old_d2 ON old_d2.id = ah.old_driver2_id
  LEFT JOIN profiles disp ON disp.user_id = ah.dispatcher_id
  LEFT JOIN profiles old_disp ON old_disp.user_id = ah.old_dispatcher_id
  WHERE 
    CASE 
      WHEN p_entity_type = 'truck' THEN ah.truck_id = p_entity_id OR ah.old_truck_id = p_entity_id
      WHEN p_entity_type = 'trailer' THEN ah.trailer_id = p_entity_id OR ah.old_trailer_id = p_entity_id
      WHEN p_entity_type = 'driver' THEN ah.driver1_id = p_entity_id OR ah.driver2_id = p_entity_id 
                                       OR ah.old_driver1_id = p_entity_id OR ah.old_driver2_id = p_entity_id
      ELSE false
    END
    AND (p_from_date IS NULL OR ah.changed_at >= p_from_date)
    AND (p_to_date IS NULL OR ah.changed_at <= p_to_date)
  ORDER BY ah.changed_at DESC, ah.id DESC
  LIMIT p_limit;
END;
$$;