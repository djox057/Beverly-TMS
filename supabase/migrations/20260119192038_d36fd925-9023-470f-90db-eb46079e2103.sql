-- Add reason column to assignment_history table
ALTER TABLE public.assignment_history 
ADD COLUMN reason text;