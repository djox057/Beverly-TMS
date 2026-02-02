-- Add accounting_note column to repairs table
ALTER TABLE public.repairs 
ADD COLUMN accounting_note TEXT;