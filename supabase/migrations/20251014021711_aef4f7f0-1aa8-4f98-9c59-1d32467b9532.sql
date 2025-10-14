-- Add booked_by_company_id to orders table to track the company that booked the order
-- This is separate from company_id which now represents the truck's company for internal load numbering

ALTER TABLE public.orders 
ADD COLUMN IF NOT EXISTS booked_by_company_id UUID REFERENCES public.companies(id);

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_orders_booked_by_company_id 
ON public.orders(booked_by_company_id);

-- Add comment to clarify the distinction
COMMENT ON COLUMN public.orders.company_id IS 'The truck''s company - used for internal load number sequencing';
COMMENT ON COLUMN public.orders.booked_by_company_id IS 'The company that booked/created this order - for business tracking';