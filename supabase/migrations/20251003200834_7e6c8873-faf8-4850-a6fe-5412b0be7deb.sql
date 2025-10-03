-- Add 'safety' role to the app_role enum type
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'safety';