-- Add emergency contact fields to drivers table
ALTER TABLE public.drivers
ADD COLUMN IF NOT EXISTS emergency_contact_name text,
ADD COLUMN IF NOT EXISTS emergency_contact_relation text,
ADD COLUMN IF NOT EXISTS emergency_contact_phone text;