CREATE TABLE IF NOT EXISTS public.samsara_locations_cache (
  id text PRIMARY KEY DEFAULT 'latest',
  locations jsonb NOT NULL DEFAULT '[]',
  fetched_at timestamptz NOT NULL DEFAULT now(),
  is_fetching boolean NOT NULL DEFAULT false,
  fetch_started_at timestamptz
);

ALTER TABLE public.samsara_locations_cache ENABLE ROW LEVEL SECURITY;

INSERT INTO public.samsara_locations_cache (id, locations, fetched_at, is_fetching)
VALUES ('latest', '[]', '1970-01-01T00:00:00Z', false)
ON CONFLICT (id) DO NOTHING;