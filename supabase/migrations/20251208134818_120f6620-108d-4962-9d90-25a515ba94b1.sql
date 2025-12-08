-- Create table for afterhours schedule
CREATE TABLE public.afterhours_schedule (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  scheduled_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  UNIQUE (user_id, scheduled_date)
);

-- Enable RLS
ALTER TABLE public.afterhours_schedule ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Authenticated users can view afterhours schedule"
ON public.afterhours_schedule
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Admins and managers can insert afterhours schedule"
ON public.afterhours_schedule
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role((SELECT auth.uid()), 'admin'::app_role) OR
  public.has_role((SELECT auth.uid()), 'manager'::app_role)
);

CREATE POLICY "Admins and managers can delete afterhours schedule"
ON public.afterhours_schedule
FOR DELETE
TO authenticated
USING (
  public.has_role((SELECT auth.uid()), 'admin'::app_role) OR
  public.has_role((SELECT auth.uid()), 'manager'::app_role)
);