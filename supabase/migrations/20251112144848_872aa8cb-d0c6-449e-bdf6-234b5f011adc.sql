-- Create table to track truck/trailer/driver assignment history
CREATE TABLE public.assignment_history (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  truck_id UUID REFERENCES public.trucks(id) ON DELETE CASCADE,
  trailer_id UUID REFERENCES public.trailers(id) ON DELETE CASCADE,
  driver1_id UUID REFERENCES public.drivers(id) ON DELETE SET NULL,
  driver2_id UUID REFERENCES public.drivers(id) ON DELETE SET NULL,
  changed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  changed_by UUID REFERENCES auth.users(id),
  change_type TEXT NOT NULL CHECK (change_type IN ('truck_update', 'trailer_update', 'driver_update')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.assignment_history ENABLE ROW LEVEL SECURITY;

-- RLS Policies for assignment_history
CREATE POLICY "Authenticated users can view assignment history"
ON public.assignment_history
FOR SELECT
USING (
  has_role(auth.uid(), 'dispatch'::app_role) OR
  has_role(auth.uid(), 'afterhours'::app_role) OR
  has_role(auth.uid(), 'manager'::app_role) OR
  has_role(auth.uid(), 'admin'::app_role) OR
  has_role(auth.uid(), 'accounting'::app_role) OR
  has_role(auth.uid(), 'supervisor'::app_role) OR
  has_role(auth.uid(), 'safety'::app_role) OR
  has_role(auth.uid(), 'maintenance'::app_role)
);

CREATE POLICY "System can insert assignment history"
ON public.assignment_history
FOR INSERT
WITH CHECK (true);

-- Create function to log truck assignment changes
CREATE OR REPLACE FUNCTION public.log_truck_assignment_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only log if relevant fields changed
  IF (OLD.trailer_id IS DISTINCT FROM NEW.trailer_id) OR
     (OLD.driver1_id IS DISTINCT FROM NEW.driver1_id) OR
     (OLD.driver2_id IS DISTINCT FROM NEW.driver2_id) THEN
    
    INSERT INTO public.assignment_history (
      truck_id,
      trailer_id,
      driver1_id,
      driver2_id,
      changed_by,
      change_type
    ) VALUES (
      NEW.id,
      NEW.trailer_id,
      NEW.driver1_id,
      NEW.driver2_id,
      auth.uid(),
      'truck_update'
    );
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create function to log trailer assignment changes
CREATE OR REPLACE FUNCTION public.log_trailer_assignment_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  assigned_truck_id UUID;
BEGIN
  -- Only log if truck assignment changed
  IF (OLD.assigned_truck_id IS DISTINCT FROM NEW.assigned_truck_id) THEN
    -- Get the truck's current drivers
    IF NEW.assigned_truck_id IS NOT NULL THEN
      SELECT id INTO assigned_truck_id FROM trucks WHERE id = NEW.assigned_truck_id;
      
      INSERT INTO public.assignment_history (
        truck_id,
        trailer_id,
        driver1_id,
        driver2_id,
        changed_by,
        change_type
      )
      SELECT 
        t.id,
        NEW.id,
        t.driver1_id,
        t.driver2_id,
        auth.uid(),
        'trailer_update'
      FROM trucks t
      WHERE t.id = NEW.assigned_truck_id;
    ELSE
      -- Trailer unassigned
      INSERT INTO public.assignment_history (
        truck_id,
        trailer_id,
        driver1_id,
        driver2_id,
        changed_by,
        change_type
      ) VALUES (
        OLD.assigned_truck_id,
        NEW.id,
        NULL,
        NULL,
        auth.uid(),
        'trailer_update'
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create triggers
CREATE TRIGGER log_truck_changes
AFTER UPDATE ON public.trucks
FOR EACH ROW
EXECUTE FUNCTION public.log_truck_assignment_change();

CREATE TRIGGER log_trailer_changes
AFTER UPDATE ON public.trailers
FOR EACH ROW
EXECUTE FUNCTION public.log_trailer_assignment_change();