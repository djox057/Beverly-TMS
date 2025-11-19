-- Add new fields to drivers table for company information and truck payment
ALTER TABLE drivers
ADD COLUMN IF NOT EXISTS company_name TEXT,
ADD COLUMN IF NOT EXISTS company_address TEXT,
ADD COLUMN IF NOT EXISTS mc_number TEXT,
ADD COLUMN IF NOT EXISTS weekly_payment INTEGER,
ADD COLUMN IF NOT EXISTS weeks_count INTEGER;