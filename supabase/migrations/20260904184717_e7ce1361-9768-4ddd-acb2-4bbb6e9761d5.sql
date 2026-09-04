CREATE TABLE public.truck_telemetry (
  truck_id uuid PRIMARY KEY REFERENCES public.trucks(id) ON DELETE CASCADE,
  fuel_level numeric,
  miles_away numeric,
  eta_minutes integer,
  miles_away_updated_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.truck_telemetry TO anon;
GRANT SELECT ON public.truck_telemetry TO authenticated;
GRANT ALL ON public.truck_telemetry TO service_role;

ALTER TABLE public.truck_telemetry ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view truck telemetry"
ON public.truck_telemetry FOR SELECT TO authenticated USING (true);

CREATE POLICY "Anon can view truck telemetry"
ON public.truck_telemetry FOR SELECT TO anon USING (true);

CREATE TRIGGER update_truck_telemetry_updated_at
BEFORE UPDATE ON public.truck_telemetry
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.truck_telemetry (truck_id, fuel_level, miles_away, eta_minutes, miles_away_updated_at)
SELECT id, fuel_level, miles_away, eta_minutes, miles_away_updated_at FROM public.trucks
ON CONFLICT (truck_id) DO NOTHING;