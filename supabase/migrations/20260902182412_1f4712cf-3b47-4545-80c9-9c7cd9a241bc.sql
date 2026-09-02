CREATE TABLE IF NOT EXISTS public.truck_company_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  truck_id uuid NOT NULL REFERENCES public.trucks(id) ON DELETE CASCADE,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  company_name_snapshot text,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  changed_by uuid,
  changed_by_name_snapshot text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.truck_company_history TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.truck_company_history TO authenticated;
GRANT ALL ON public.truck_company_history TO service_role;

ALTER TABLE public.truck_company_history ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can view truck company history" ON public.truck_company_history;
CREATE POLICY "Anyone can view truck company history"
  ON public.truck_company_history FOR SELECT USING (true);

CREATE INDEX IF NOT EXISTS idx_truck_company_history_truck ON public.truck_company_history(truck_id, started_at DESC);

CREATE OR REPLACE FUNCTION public.log_truck_company_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_company_name text;
  v_changed_by_name text;
  v_changed_by uuid;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.company_id IS NULL THEN
      RETURN NEW;
    END IF;
    SELECT name INTO v_company_name FROM public.companies WHERE id = NEW.company_id;
    v_changed_by := auth.uid();
    IF v_changed_by IS NOT NULL THEN
      SELECT full_name INTO v_changed_by_name FROM public.profiles WHERE user_id = v_changed_by;
    END IF;
    INSERT INTO public.truck_company_history
      (truck_id, company_id, company_name_snapshot, started_at, changed_by, changed_by_name_snapshot)
    VALUES (NEW.id, NEW.company_id, v_company_name, now(), v_changed_by, v_changed_by_name);
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.company_id IS NOT DISTINCT FROM NEW.company_id THEN
      RETURN NEW;
    END IF;

    UPDATE public.truck_company_history
      SET ended_at = now()
    WHERE truck_id = NEW.id AND ended_at IS NULL;

    IF NEW.company_id IS NOT NULL THEN
      SELECT name INTO v_company_name FROM public.companies WHERE id = NEW.company_id;
    ELSE
      v_company_name := NULL;
    END IF;
    v_changed_by := auth.uid();
    IF v_changed_by IS NOT NULL THEN
      SELECT full_name INTO v_changed_by_name FROM public.profiles WHERE user_id = v_changed_by;
    END IF;

    INSERT INTO public.truck_company_history
      (truck_id, company_id, company_name_snapshot, started_at, changed_by, changed_by_name_snapshot)
    VALUES (NEW.id, NEW.company_id, v_company_name, now(), v_changed_by, v_changed_by_name);
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_log_truck_company_change ON public.trucks;
CREATE TRIGGER trg_log_truck_company_change
AFTER INSERT OR UPDATE OF company_id ON public.trucks
FOR EACH ROW EXECUTE FUNCTION public.log_truck_company_change();

INSERT INTO public.truck_company_history (truck_id, company_id, company_name_snapshot, started_at)
SELECT t.id, t.company_id, c.name, COALESCE(t.created_at, now())
FROM public.trucks t
LEFT JOIN public.companies c ON c.id = t.company_id
WHERE t.company_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.truck_company_history h WHERE h.truck_id = t.id
  );