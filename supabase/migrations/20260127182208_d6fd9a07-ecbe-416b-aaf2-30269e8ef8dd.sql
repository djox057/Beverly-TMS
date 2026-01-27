-- ============================================
-- HARDENING ASSIGNMENT HISTORY: COMPREHENSIVE FIX
-- ============================================

-- 1. ADD BEFORE/AFTER COLUMNS FOR EXPLICIT CHANGE TRACKING
-- This resolves the ambiguity of assignment_change by storing exactly what changed
ALTER TABLE public.assignment_history 
ADD COLUMN IF NOT EXISTS old_driver1_id uuid REFERENCES public.drivers(id),
ADD COLUMN IF NOT EXISTS old_driver2_id uuid REFERENCES public.drivers(id),
ADD COLUMN IF NOT EXISTS old_trailer_id uuid REFERENCES public.trailers(id),
ADD COLUMN IF NOT EXISTS old_truck_id uuid REFERENCES public.trucks(id);

-- 2. CREATE TRIGGER FUNCTION TO AUTO-LOG TRUCK ASSIGNMENT CHANGES
-- This ensures history is NEVER missed, even if app code forgets to log
CREATE OR REPLACE FUNCTION public.log_truck_assignment_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  has_driver_change boolean := false;
  has_trailer_change boolean := false;
  change_type text;
BEGIN
  -- Check what changed
  has_driver_change := (OLD.driver1_id IS DISTINCT FROM NEW.driver1_id) 
                    OR (OLD.driver2_id IS DISTINCT FROM NEW.driver2_id);
  has_trailer_change := OLD.trailer_id IS DISTINCT FROM NEW.trailer_id;
  
  -- Only log if something actually changed
  IF NOT has_driver_change AND NOT has_trailer_change THEN
    RETURN NEW;
  END IF;
  
  -- Determine change type
  IF has_driver_change AND has_trailer_change THEN
    change_type := 'assignment_change';
  ELSIF has_driver_change THEN
    change_type := 'driver_assignment';
  ELSE
    change_type := 'trailer_assignment';
  END IF;
  
  -- Insert history record with before/after values
  INSERT INTO public.assignment_history (
    truck_id,
    trailer_id,
    driver1_id,
    driver2_id,
    old_truck_id,
    old_trailer_id,
    old_driver1_id,
    old_driver2_id,
    change_type,
    changed_at,
    changed_by,
    reason
  ) VALUES (
    NEW.id,
    NEW.trailer_id,
    NEW.driver1_id,
    NEW.driver2_id,
    OLD.id,
    OLD.trailer_id,
    OLD.driver1_id,
    OLD.driver2_id,
    change_type,
    now(),
    auth.uid(),
    NULL -- Reason will be updated by app code if available
  );
  
  RETURN NEW;
END;
$$;

-- 3. CREATE THE TRIGGER ON TRUCKS TABLE
DROP TRIGGER IF EXISTS trigger_log_truck_assignment_changes ON public.trucks;
CREATE TRIGGER trigger_log_truck_assignment_changes
  AFTER UPDATE ON public.trucks
  FOR EACH ROW
  EXECUTE FUNCTION public.log_truck_assignment_changes();

-- 4. REPLACE get_assignment_history RPC WITH IMPROVED VERSION
-- Adds: deterministic ordering, date filtering, includes before/after values
CREATE OR REPLACE FUNCTION public.get_assignment_history(
  p_entity_type text, 
  p_entity_id uuid,
  p_from_date timestamptz DEFAULT NULL,
  p_to_date timestamptz DEFAULT NULL,
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
  changed_at timestamptz, 
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
  old_driver2_name text
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
    ah.changed_at,
    ah.changed_by,
    ah.change_type,
    t.truck_number,
    tr.trailer_number,
    d1.name as driver1_name,
    d2.name as driver2_name,
    p.full_name as changed_by_name,
    ah.reason,
    old_t.truck_number as old_truck_number,
    old_tr.trailer_number as old_trailer_number,
    old_d1.name as old_driver1_name,
    old_d2.name as old_driver2_name
  FROM assignment_history ah
  LEFT JOIN trucks t ON ah.truck_id = t.id
  LEFT JOIN trailers tr ON ah.trailer_id = tr.id
  LEFT JOIN drivers d1 ON ah.driver1_id = d1.id
  LEFT JOIN drivers d2 ON ah.driver2_id = d2.id
  LEFT JOIN profiles p ON ah.changed_by = p.user_id
  -- Old values joins
  LEFT JOIN trucks old_t ON ah.old_truck_id = old_t.id
  LEFT JOIN trailers old_tr ON ah.old_trailer_id = old_tr.id
  LEFT JOIN drivers old_d1 ON ah.old_driver1_id = old_d1.id
  LEFT JOIN drivers old_d2 ON ah.old_driver2_id = old_d2.id
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
  -- CRITICAL: Deterministic ordering by timestamp DESC, then by ID for stability
  ORDER BY ah.changed_at DESC, ah.id DESC
  LIMIT p_limit;
END;
$$;

-- 5. ADD INDEX FOR PERFORMANCE ON NEW COLUMNS
CREATE INDEX IF NOT EXISTS idx_assignment_history_old_driver1 ON public.assignment_history(old_driver1_id);
CREATE INDEX IF NOT EXISTS idx_assignment_history_old_driver2 ON public.assignment_history(old_driver2_id);
CREATE INDEX IF NOT EXISTS idx_assignment_history_old_trailer ON public.assignment_history(old_trailer_id);
CREATE INDEX IF NOT EXISTS idx_assignment_history_old_truck ON public.assignment_history(old_truck_id);
CREATE INDEX IF NOT EXISTS idx_assignment_history_changed_at ON public.assignment_history(changed_at DESC);

-- 6. GRANT EXECUTE ON THE UPDATED FUNCTION
GRANT EXECUTE ON FUNCTION public.get_assignment_history(text, uuid, timestamptz, timestamptz, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_assignment_history(text, uuid, timestamptz, timestamptz, integer) TO anon;