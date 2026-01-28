-- Create table to track dispatcher-supervisor assignments
CREATE TABLE public.dispatcher_supervisors (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  dispatcher_id UUID NOT NULL,
  supervisor_id UUID NOT NULL,
  assigned_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  assigned_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(dispatcher_id) -- Each dispatcher can only have one supervisor
);

-- Enable Row Level Security
ALTER TABLE public.dispatcher_supervisors ENABLE ROW LEVEL SECURITY;

-- Create policies for access
CREATE POLICY "Authenticated users can view dispatcher supervisors"
ON public.dispatcher_supervisors
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Managers and admins can manage dispatcher supervisors"
ON public.dispatcher_supervisors
FOR ALL
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin') OR 
  public.has_role(auth.uid(), 'manager')
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin') OR 
  public.has_role(auth.uid(), 'manager')
);

-- Create index for efficient lookups
CREATE INDEX idx_dispatcher_supervisors_supervisor ON public.dispatcher_supervisors(supervisor_id);
CREATE INDEX idx_dispatcher_supervisors_dispatcher ON public.dispatcher_supervisors(dispatcher_id);

-- Create trigger for updated_at
CREATE TRIGGER update_dispatcher_supervisors_updated_at
BEFORE UPDATE ON public.dispatcher_supervisors
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();