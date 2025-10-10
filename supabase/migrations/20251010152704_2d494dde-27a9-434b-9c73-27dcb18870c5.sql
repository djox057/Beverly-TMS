-- Add canceled column to orders table
ALTER TABLE public.orders 
ADD COLUMN canceled boolean NOT NULL DEFAULT false;

-- Create an index for better query performance
CREATE INDEX idx_orders_canceled ON public.orders(canceled);

COMMENT ON COLUMN public.orders.canceled IS 'Indicates if the order has been canceled';