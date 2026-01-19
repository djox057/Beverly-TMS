-- Add invoiced_at timestamp to track when orders were marked as invoiced
ALTER TABLE public.orders 
ADD COLUMN invoiced_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Create index for efficient filtering
CREATE INDEX idx_orders_invoiced_at ON public.orders(invoiced_at) WHERE invoiced_at IS NOT NULL;