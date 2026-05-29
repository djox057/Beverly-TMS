
-- Driver company history tracking
CREATE TABLE public.driver_company_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  company_id uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  company_name_snapshot text,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  changed_by uuid,
  changed_by_name_snapshot text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_driver_company_history_driver ON public.driver_company_history(driver_id, started_at DESC);
CREATE UNIQUE INDEX idx_driver_company_history_open
  ON public.driver_company_history(driver_id) WHERE ended_at IS NULL;

GRANT SELECT ON public.driver_company_history TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.driver_company_history TO authenticated;
GRANT ALL ON public.driver_company_history TO service_role;

ALTER TABLE public.driver_company_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can view driver company history"
  ON public.driver_company_history FOR SELECT
  USING (true);

-- Trigger function
CREATE OR REPLACE FUNCTION public.log_driver_company_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
    INSERT INTO public.driver_company_history
      (driver_id, company_id, company_name_snapshot, started_at, changed_by, changed_by_name_snapshot)
    VALUES
      (NEW.id, NEW.company_id, v_company_name, now(), v_changed_by, v_changed_by_name);
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF OLD.company_id IS NOT DISTINCT FROM NEW.company_id THEN
      RETURN NEW;
    END IF;

    -- Close any open row for this driver
    UPDATE public.driver_company_history
      SET ended_at = now()
    WHERE driver_id = NEW.id AND ended_at IS NULL;

    IF NEW.company_id IS NOT NULL THEN
      SELECT name INTO v_company_name FROM public.companies WHERE id = NEW.company_id;
    ELSE
      v_company_name := NULL;
    END IF;
    v_changed_by := auth.uid();
    IF v_changed_by IS NOT NULL THEN
      SELECT full_name INTO v_changed_by_name FROM public.profiles WHERE user_id = v_changed_by;
    END IF;

    INSERT INTO public.driver_company_history
      (driver_id, company_id, company_name_snapshot, started_at, changed_by, changed_by_name_snapshot)
    VALUES
      (NEW.id, NEW.company_id, v_company_name, now(), v_changed_by, v_changed_by_name);

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_log_driver_company_change_ins
AFTER INSERT ON public.drivers
FOR EACH ROW EXECUTE FUNCTION public.log_driver_company_change();

CREATE TRIGGER trg_log_driver_company_change_upd
AFTER UPDATE OF company_id ON public.drivers
FOR EACH ROW EXECUTE FUNCTION public.log_driver_company_change();

-- Backfill: one open row per existing driver with a company
INSERT INTO public.driver_company_history (driver_id, company_id, company_name_snapshot, started_at)
SELECT d.id, d.company_id, c.name, COALESCE(d.hire_date::timestamptz, d.created_at, now())
FROM public.drivers d
LEFT JOIN public.companies c ON c.id = d.company_id
WHERE d.company_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.driver_company_history h
    WHERE h.driver_id = d.id AND h.ended_at IS NULL
  );
