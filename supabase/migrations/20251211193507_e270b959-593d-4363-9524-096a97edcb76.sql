-- Create deleted_trucks table for archiving truck history
CREATE TABLE public.deleted_trucks (
  id uuid NOT NULL,
  truck_number text NOT NULL,
  vin text,
  model text,
  truck_type text,
  ipass text,
  dot_inspection_date date,
  plate_expiration_date date,
  insurance_expiration_date date,
  status text,
  company_id uuid,
  dispatcher_id uuid,
  deleted_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (id)
);

-- Add deleted_truck_number column to orders table
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS deleted_truck_number text;

-- Enable RLS on deleted_trucks
ALTER TABLE public.deleted_trucks ENABLE ROW LEVEL SECURITY;

-- RLS policies for deleted_trucks (matching deleted_trailers pattern)
CREATE POLICY "Admins and maintenance can insert deleted trucks" 
ON public.deleted_trucks 
FOR INSERT 
WITH CHECK (
  has_role((SELECT auth.uid()), 'admin'::app_role) OR 
  has_role((SELECT auth.uid()), 'manager'::app_role) OR 
  has_role((SELECT auth.uid()), 'accounting'::app_role) OR 
  has_role((SELECT auth.uid()), 'maintenance'::app_role) OR 
  has_role((SELECT auth.uid()), 'safety'::app_role)
);

CREATE POLICY "Authenticated users can view deleted trucks" 
ON public.deleted_trucks 
FOR SELECT 
USING (
  has_role((SELECT auth.uid()), 'dispatch'::app_role) OR 
  has_role((SELECT auth.uid()), 'afterhours'::app_role) OR 
  has_role((SELECT auth.uid()), 'manager'::app_role) OR 
  has_role((SELECT auth.uid()), 'admin'::app_role) OR 
  has_role((SELECT auth.uid()), 'accounting'::app_role) OR 
  has_role((SELECT auth.uid()), 'supervisor'::app_role) OR 
  has_role((SELECT auth.uid()), 'safety'::app_role) OR 
  has_role((SELECT auth.uid()), 'maintenance'::app_role)
);