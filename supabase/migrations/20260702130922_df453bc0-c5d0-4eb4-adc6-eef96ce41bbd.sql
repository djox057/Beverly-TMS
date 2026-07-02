ALTER TABLE public.trucks ADD COLUMN IF NOT EXISTS oil_change_note text;
ALTER TABLE public.trucks REPLICA IDENTITY FULL;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='trucks') THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.trucks';
  END IF;
END $$;