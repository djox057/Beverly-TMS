
CREATE OR REPLACE FUNCTION public.reassign_internal_load_number(p_order_id uuid, p_new_company_id uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  current_company_id uuid;
  current_load_number integer;
  next_load_number integer;
BEGIN
  -- Lock the order row to prevent concurrent reassignments
  SELECT company_id, internal_load_number
  INTO current_company_id, current_load_number
  FROM orders
  WHERE id = p_order_id
  FOR UPDATE;

  -- Guard: order must exist
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order % not found', p_order_id;
  END IF;

  -- If company hasn't changed, return current number
  IF current_company_id IS NOT DISTINCT FROM p_new_company_id THEN
    RETURN current_load_number;
  END IF;

  -- Serialize allocation per new company
  PERFORM pg_advisory_xact_lock(hashtext(p_new_company_id::text));

  -- Get next available number for the new company
  SELECT COALESCE(MAX(internal_load_number), 0) + 1
  INTO next_load_number
  FROM orders
  WHERE company_id = p_new_company_id
    AND internal_load_number IS NOT NULL;

  -- Atomically update both company_id and internal_load_number
  UPDATE orders
  SET internal_load_number = next_load_number,
      company_id = p_new_company_id
  WHERE id = p_order_id;

  RETURN next_load_number;
END;
$function$;
