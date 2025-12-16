-- Create repairs table
CREATE TABLE public.repairs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  repair_type TEXT NOT NULL CHECK (repair_type IN ('truck', 'trailer')),
  truck_id UUID REFERENCES public.trucks(id) ON DELETE SET NULL,
  trailer_id UUID REFERENCES public.trailers(id) ON DELETE SET NULL,
  driver_id UUID NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 0,
  is_paid BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID,
  
  -- Ensure at least one asset is specified based on repair type
  CONSTRAINT valid_repair_asset CHECK (
    (repair_type = 'truck' AND truck_id IS NOT NULL) OR
    (repair_type = 'trailer' AND trailer_id IS NOT NULL)
  )
);

-- Enable RLS
ALTER TABLE public.repairs ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Admins managers accounting maintenance chicago_mgmt can view repairs"
ON public.repairs FOR SELECT
USING (
  has_role((SELECT auth.uid()), 'admin'::app_role) OR
  has_role((SELECT auth.uid()), 'manager'::app_role) OR
  has_role((SELECT auth.uid()), 'accounting'::app_role) OR
  has_role((SELECT auth.uid()), 'maintenance'::app_role) OR
  has_role((SELECT auth.uid()), 'chicago_management'::app_role)
);

CREATE POLICY "Admins managers accounting maintenance can insert repairs"
ON public.repairs FOR INSERT
WITH CHECK (
  has_role((SELECT auth.uid()), 'admin'::app_role) OR
  has_role((SELECT auth.uid()), 'manager'::app_role) OR
  has_role((SELECT auth.uid()), 'accounting'::app_role) OR
  has_role((SELECT auth.uid()), 'maintenance'::app_role)
);

CREATE POLICY "Admins managers accounting maintenance can update repairs"
ON public.repairs FOR UPDATE
USING (
  has_role((SELECT auth.uid()), 'admin'::app_role) OR
  has_role((SELECT auth.uid()), 'manager'::app_role) OR
  has_role((SELECT auth.uid()), 'accounting'::app_role) OR
  has_role((SELECT auth.uid()), 'maintenance'::app_role)
);

CREATE POLICY "Admins managers accounting can delete repairs"
ON public.repairs FOR DELETE
USING (
  has_role((SELECT auth.uid()), 'admin'::app_role) OR
  has_role((SELECT auth.uid()), 'manager'::app_role) OR
  has_role((SELECT auth.uid()), 'accounting'::app_role)
);

-- Create trigger for updated_at
CREATE TRIGGER update_repairs_updated_at
BEFORE UPDATE ON public.repairs
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create indexes for performance
CREATE INDEX idx_repairs_repair_type ON public.repairs(repair_type);
CREATE INDEX idx_repairs_truck_id ON public.repairs(truck_id);
CREATE INDEX idx_repairs_trailer_id ON public.repairs(trailer_id);
CREATE INDEX idx_repairs_driver_id ON public.repairs(driver_id);
CREATE INDEX idx_repairs_is_paid ON public.repairs(is_paid);