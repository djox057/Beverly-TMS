-- Add column to store trailer number snapshot on orders
-- This preserves the trailer number even after the trailer is deleted
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS deleted_trailer_number text;