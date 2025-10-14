-- Create dispatcher_status table to track active/inactive dispatchers
CREATE TABLE public.dispatcher_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  dispatcher_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  is_active BOOLEAN NOT NULL DEFAULT true,
  inactive_trucks JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(dispatcher_id)
);

-- Enable Row Level Security
ALTER TABLE public.dispatcher_status ENABLE ROW LEVEL SECURITY;

-- RLS Policies: Managers and admins can view dispatcher status
CREATE POLICY "Managers and admins can view dispatcher status"
  ON public.dispatcher_status
  FOR SELECT
  TO authenticated
  USING (
    has_role(auth.uid(), 'manager'::app_role) OR 
    has_role(auth.uid(), 'admin'::app_role)
  );

-- RLS Policies: Managers and admins can manage dispatcher status
CREATE POLICY "Managers and admins can insert dispatcher status"
  ON public.dispatcher_status
  FOR INSERT
  TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'manager'::app_role) OR 
    has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY "Managers and admins can update dispatcher status"
  ON public.dispatcher_status
  FOR UPDATE
  TO authenticated
  USING (
    has_role(auth.uid(), 'manager'::app_role) OR 
    has_role(auth.uid(), 'admin'::app_role)
  )
  WITH CHECK (
    has_role(auth.uid(), 'manager'::app_role) OR 
    has_role(auth.uid(), 'admin'::app_role)
  );

CREATE POLICY "Managers and admins can delete dispatcher status"
  ON public.dispatcher_status
  FOR DELETE
  TO authenticated
  USING (
    has_role(auth.uid(), 'manager'::app_role) OR 
    has_role(auth.uid(), 'admin'::app_role)
  );

-- Trigger for updated_at timestamp
CREATE TRIGGER update_dispatcher_status_updated_at
  BEFORE UPDATE ON public.dispatcher_status
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();