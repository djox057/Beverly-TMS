-- Create archive_version table to track when archives are updated
CREATE TABLE public.archive_version (
  id TEXT PRIMARY KEY DEFAULT 'locked-orders',
  version BIGINT NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Insert initial rows for each archive type
INSERT INTO public.archive_version (id, version) VALUES 
  ('locked-orders', 0),
  ('pickup-drops', 0),
  ('order-files', 0),
  ('order-transfers', 0);

-- Enable RLS
ALTER TABLE public.archive_version ENABLE ROW LEVEL SECURITY;

-- Anyone authenticated can read version (tiny query, just checking if refresh needed)
CREATE POLICY "Authenticated users can view archive version"
ON public.archive_version
FOR SELECT
USING (auth.uid() IS NOT NULL);

-- Only managers, admins, and accounting can update version (when they upload archives)
CREATE POLICY "Managers admins accounting can update archive version"
ON public.archive_version
FOR UPDATE
USING (
  has_role((SELECT auth.uid()), 'manager'::app_role) OR 
  has_role((SELECT auth.uid()), 'admin'::app_role) OR 
  has_role((SELECT auth.uid()), 'accounting'::app_role)
);