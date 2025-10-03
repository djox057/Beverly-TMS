-- Add new fields to drivers table
ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS personal_id text,
  ADD COLUMN IF NOT EXISTS fuel_card_number text,
  ADD COLUMN IF NOT EXISTS cdl_number text,
  ADD COLUMN IF NOT EXISTS cdl_expiration_date date,
  ADD COLUMN IF NOT EXISTS hire_date date,
  ADD COLUMN IF NOT EXISTS termination_date date,
  ADD COLUMN IF NOT EXISTS mvr_date date,
  ADD COLUMN IF NOT EXISTS clearing_house text,
  ADD COLUMN IF NOT EXISTS ssn text,
  ADD COLUMN IF NOT EXISTS fein text;