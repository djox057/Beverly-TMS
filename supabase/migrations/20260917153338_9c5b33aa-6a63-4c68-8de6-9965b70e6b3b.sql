CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE public.hr_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_name text NOT NULL DEFAULT '',
  truck_number text NOT NULL DEFAULT '',
  problem_type text NOT NULL DEFAULT 'other',
  problem_other text,
  reason text NOT NULL DEFAULT '',
  updates text,
  is_pinned boolean NOT NULL DEFAULT false,
  is_resolved boolean NOT NULL DEFAULT false,
  resolved_at timestamptz,
  archived boolean NOT NULL DEFAULT false,
  archived_at timestamptz,
  reviewed boolean NOT NULL DEFAULT false,
  reviewed_at timestamptz,
  reviewed_by_name text,
  created_by uuid,
  created_by_name text,
  embedding vector(3072),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.hr_reports TO authenticated;
GRANT ALL ON public.hr_reports TO service_role;

ALTER TABLE public.hr_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "HR staff can view hr reports" ON public.hr_reports
  FOR SELECT TO authenticated
  USING (public.has_any_role(ARRAY['admin','manager','chicago_management']::app_role[]));

CREATE POLICY "HR staff can insert hr reports" ON public.hr_reports
  FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(ARRAY['admin','manager','chicago_management']::app_role[]));

CREATE POLICY "HR staff can update hr reports" ON public.hr_reports
  FOR UPDATE TO authenticated
  USING (public.has_any_role(ARRAY['admin','manager','chicago_management']::app_role[]))
  WITH CHECK (public.has_any_role(ARRAY['admin','manager','chicago_management']::app_role[]));

CREATE POLICY "HR staff can delete hr reports" ON public.hr_reports
  FOR DELETE TO authenticated
  USING (public.has_any_role(ARRAY['admin','manager','chicago_management']::app_role[]));

CREATE TRIGGER update_hr_reports_updated_at
  BEFORE UPDATE ON public.hr_reports
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX hr_reports_created_at_idx ON public.hr_reports (created_at DESC);
CREATE INDEX hr_reports_archived_idx ON public.hr_reports (archived);
CREATE INDEX hr_reports_embedding_idx
  ON public.hr_reports USING hnsw ((embedding::halfvec(3072)) halfvec_cosine_ops);

CREATE OR REPLACE FUNCTION public.search_hr_reports(
  query_embedding vector(3072),
  match_threshold double precision DEFAULT 0.3,
  match_count int DEFAULT 50
)
RETURNS TABLE (id uuid, similarity double precision)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT h.id,
         1 - (h.embedding::halfvec(3072) <=> query_embedding::halfvec(3072)) AS similarity
  FROM public.hr_reports h
  WHERE h.embedding IS NOT NULL
    AND 1 - (h.embedding::halfvec(3072) <=> query_embedding::halfvec(3072)) >= match_threshold
  ORDER BY h.embedding::halfvec(3072) <=> query_embedding::halfvec(3072)
  LIMIT match_count;
$$;

GRANT EXECUTE ON FUNCTION public.search_hr_reports(vector, double precision, int) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.archive_completed_hr_reports()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n integer;
BEGIN
  UPDATE public.hr_reports
     SET archived = true,
         archived_at = now()
   WHERE is_resolved = true
     AND archived = false;
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

ALTER PUBLICATION supabase_realtime ADD TABLE public.hr_reports;
ALTER TABLE public.hr_reports REPLICA IDENTITY FULL;

SELECT cron.schedule(
  'archive-completed-hr-reports-daily',
  '5 5 * * *',
  $$SELECT public.archive_completed_hr_reports();$$
);