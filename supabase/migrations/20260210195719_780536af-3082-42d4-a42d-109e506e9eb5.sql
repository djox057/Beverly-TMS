-- Fix dispatcher_status CASCADE to preserve off-duty data when user is deleted
ALTER TABLE public.dispatcher_status DROP CONSTRAINT dispatcher_status_dispatcher_id_fkey;
ALTER TABLE public.dispatcher_status ADD CONSTRAINT dispatcher_status_dispatcher_id_fkey 
  FOREIGN KEY (dispatcher_id) REFERENCES auth.users(id) ON DELETE SET NULL;

-- Make dispatcher_id nullable so SET NULL works
ALTER TABLE public.dispatcher_status ALTER COLUMN dispatcher_id DROP NOT NULL;