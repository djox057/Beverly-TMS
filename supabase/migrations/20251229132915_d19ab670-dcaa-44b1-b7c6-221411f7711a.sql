-- Add eta_minutes column to trucks table for storing estimated time of arrival
ALTER TABLE public.trucks ADD COLUMN eta_minutes integer;