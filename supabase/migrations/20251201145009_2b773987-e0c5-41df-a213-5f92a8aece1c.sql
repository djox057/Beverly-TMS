CREATE TABLE public.archived_orders_metadata (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  last_updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.archived_orders_metadata ENABLE ROW LEVEL SECURITY;