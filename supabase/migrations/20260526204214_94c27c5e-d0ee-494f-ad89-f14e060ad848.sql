-- Add 'claims' to the app_role enum so it can be assigned to users
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'claims';