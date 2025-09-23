-- Make city and state nullable in pickup_drops table since they're being removed from the form
ALTER TABLE public.pickup_drops 
ALTER COLUMN city DROP NOT NULL,
ALTER COLUMN state DROP NOT NULL;