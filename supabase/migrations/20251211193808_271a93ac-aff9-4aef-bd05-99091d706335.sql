-- Create deleted_drivers table for archiving driver history
CREATE TABLE public.deleted_drivers (
  id uuid NOT NULL,
  first_name text,
  last_name text,
  name text,
  phone text,
  email text,
  company_id uuid,
  dispatcher_id uuid,
  home_address text,
  home_city text,
  home_state text,
  home_latitude numeric,
  home_longitude numeric,
  cdl_number text,
  cdl_expiration_date date,
  medical_card_expiration_date date,
  random_drug_test_date date,
  hire_date date,
  termination_date date,
  mvr_date date,
  clearing_house text,
  license_number text,
  company_name text,
  company_address text,
  mc_number text,
  weekly_payment integer,
  weeks_count integer,
  agreement_start_date date,
  is_active boolean,
  is_recovery boolean,
  is_company_driver boolean,
  cents_per_mile integer,
  going_yard boolean,
  two_week_block_date date,
  is_checked_for_termination boolean,
  emergency_contact_name text,
  emergency_contact_relation text,
  emergency_contact_phone text,
  deleted_at timestamp with time zone NOT NULL DEFAULT now(),
  deleted_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  PRIMARY KEY (id)
);

-- Add deleted_driver1_name and deleted_driver2_name columns to orders table
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS deleted_driver1_name text;
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS deleted_driver2_name text;

-- Enable RLS on deleted_drivers
ALTER TABLE public.deleted_drivers ENABLE ROW LEVEL SECURITY;

-- RLS policies for deleted_drivers (matching deleted_trailers/deleted_trucks pattern)
CREATE POLICY "Admins and maintenance can insert deleted drivers" 
ON public.deleted_drivers 
FOR INSERT 
WITH CHECK (
  has_role((SELECT auth.uid()), 'admin'::app_role) OR 
  has_role((SELECT auth.uid()), 'manager'::app_role) OR 
  has_role((SELECT auth.uid()), 'accounting'::app_role) OR 
  has_role((SELECT auth.uid()), 'maintenance'::app_role) OR 
  has_role((SELECT auth.uid()), 'safety'::app_role)
);

CREATE POLICY "Authenticated users can view deleted drivers" 
ON public.deleted_drivers 
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