-- Allow null values in the note column of lost_day_notes table
-- This is needed so home time entries can have null note with note_type='home_time'
ALTER TABLE public.lost_day_notes 
ALTER COLUMN note DROP NOT NULL;