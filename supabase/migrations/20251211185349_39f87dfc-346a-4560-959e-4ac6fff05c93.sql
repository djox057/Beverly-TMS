-- Create deleted_trailers history table to preserve trailer data
CREATE TABLE public.deleted_trailers (
  id uuid PRIMARY KEY,
  trailer_number text NOT NULL,
  trailer_type text,
  vin text,
  capacity integer,
  dot_inspection_date date,
  plate_expiration_date date,
  insurance_expiration_date date,
  status text,
  deleted_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.deleted_trailers ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for deleted_trailers
CREATE POLICY "Authenticated users can view deleted trailers"
ON public.deleted_trailers FOR SELECT
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

CREATE POLICY "Admins and maintenance can insert deleted trailers"
ON public.deleted_trailers FOR INSERT
WITH CHECK (
  has_role((SELECT auth.uid()), 'admin'::app_role) OR
  has_role((SELECT auth.uid()), 'manager'::app_role) OR
  has_role((SELECT auth.uid()), 'accounting'::app_role) OR
  has_role((SELECT auth.uid()), 'maintenance'::app_role) OR
  has_role((SELECT auth.uid()), 'safety'::app_role)
);

-- Drop existing FK constraint on orders.trailer_id
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_trailer_id_fkey;

-- Recreate FK with ON DELETE SET NULL
ALTER TABLE public.orders 
ADD CONSTRAINT orders_trailer_id_fkey 
FOREIGN KEY (trailer_id) 
REFERENCES public.trailers(id) 
ON DELETE SET NULL;