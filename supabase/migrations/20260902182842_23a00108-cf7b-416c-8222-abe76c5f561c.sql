CREATE TABLE IF NOT EXISTS public.trailer_company_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trailer_id uuid NOT NULL REFERENCES public.trailers(id) ON DELETE CASCADE,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  company_name_snapshot text,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  changed_by uuid,
  changed_by_name_snapshot text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.trailer_company_history TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trailer_company_history TO authenticated;
GRANT ALL ON public.trailer_company_history TO service_role;

ALTER TABLE public.trailer_company_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view trailer company history" ON public.trailer_company_history;
CREATE POLICY "Anyone can view trailer company history"
  ON public.trailer_company_history FOR SELECT USING (true);

CREATE INDEX IF NOT EXISTS idx_trailer_company_history_trailer ON public.trailer_company_history(trailer_id, started_at DESC);

CREATE OR REPLACE FUNCTION public.log_trailer_company_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_company_name text;
  v_changed_by uuid;
  v_changed_by_name text;
BEGIN
  v_changed_by := auth.uid();
  IF v_changed_by IS NOT NULL THEN
    SELECT full_name INTO v_changed_by_name FROM public.profiles WHERE user_id = v_changed_by;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.trailer_id IS NULL OR NEW.company_id IS NULL THEN
      RETURN NEW;
    END IF;
    SELECT name INTO v_company_name FROM public.companies WHERE id = NEW.company_id;
    UPDATE public.trailer_company_history SET ended_at = now()
      WHERE trailer_id = NEW.trailer_id AND ended_at IS NULL;
    INSERT INTO public.trailer_company_history
      (trailer_id, company_id, company_name_snapshot, started_at, changed_by, changed_by_name_snapshot)
    VALUES (NEW.trailer_id, NEW.company_id, v_company_name, now(), v_changed_by, v_changed_by_name);
    RETURN NEW;
  END IF;

  -- UPDATE
  IF OLD.trailer_id IS DISTINCT FROM NEW.trailer_id THEN
    IF OLD.trailer_id IS NOT NULL THEN
      UPDATE public.trailer_company_history SET ended_at = now()
        WHERE trailer_id = OLD.trailer_id AND ended_at IS NULL;
    END IF;
    IF NEW.trailer_id IS NOT NULL AND NEW.company_id IS NOT NULL THEN
      SELECT name INTO v_company_name FROM public.companies WHERE id = NEW.company_id;
      UPDATE public.trailer_company_history SET ended_at = now()
        WHERE trailer_id = NEW.trailer_id AND ended_at IS NULL;
      INSERT INTO public.trailer_company_history
        (trailer_id, company_id, company_name_snapshot, started_at, changed_by, changed_by_name_snapshot)
      VALUES (NEW.trailer_id, NEW.company_id, v_company_name, now(), v_changed_by, v_changed_by_name);
    END IF;
    RETURN NEW;
  END IF;

  IF OLD.company_id IS DISTINCT FROM NEW.company_id AND NEW.trailer_id IS NOT NULL THEN
    UPDATE public.trailer_company_history SET ended_at = now()
      WHERE trailer_id = NEW.trailer_id AND ended_at IS NULL;
    IF NEW.company_id IS NOT NULL THEN
      SELECT name INTO v_company_name FROM public.companies WHERE id = NEW.company_id;
      INSERT INTO public.trailer_company_history
        (trailer_id, company_id, company_name_snapshot, started_at, changed_by, changed_by_name_snapshot)
      VALUES (NEW.trailer_id, NEW.company_id, v_company_name, now(), v_changed_by, v_changed_by_name);
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.log_trailer_company_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_log_trailer_company_change ON public.trucks;
CREATE TRIGGER trg_log_trailer_company_change
AFTER INSERT OR UPDATE OF trailer_id, company_id ON public.trucks
FOR EACH ROW EXECUTE FUNCTION public.log_trailer_company_change();

INSERT INTO public.trailer_company_history (trailer_id, company_id, company_name_snapshot, started_at)
SELECT DISTINCT ON (t.trailer_id) t.trailer_id, t.company_id, c.name, COALESCE(t.updated_at, t.created_at, now())
FROM public.trucks t
LEFT JOIN public.companies c ON c.id = t.company_id
WHERE t.trailer_id IS NOT NULL AND t.company_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.trailer_company_history h WHERE h.trailer_id = t.trailer_id
  )
ORDER BY t.trailer_id, t.updated_at DESC NULLS LAST;