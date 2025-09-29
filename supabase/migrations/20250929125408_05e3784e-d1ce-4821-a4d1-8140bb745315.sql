-- Add HOS columns to trucks table
ALTER TABLE public.trucks ADD COLUMN hos_drive_minutes integer;
ALTER TABLE public.trucks ADD COLUMN hos_shift_minutes integer;
ALTER TABLE public.trucks ADD COLUMN hos_cycle_minutes integer;
ALTER TABLE public.trucks ADD COLUMN hos_status text;
ALTER TABLE public.trucks ADD COLUMN hos_last_updated timestamp with time zone;