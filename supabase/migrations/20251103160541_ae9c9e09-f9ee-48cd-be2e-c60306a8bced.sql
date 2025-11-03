-- Create geocoding cache table to reduce external API calls
CREATE TABLE IF NOT EXISTS public.geocoding_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  address text NOT NULL UNIQUE,
  latitude numeric(10, 7) NOT NULL,
  longitude numeric(10, 7) NOT NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  hit_count integer DEFAULT 0
);

-- Create index for fast lookups
CREATE INDEX IF NOT EXISTS idx_geocoding_cache_address ON public.geocoding_cache(address);

-- Enable RLS
ALTER TABLE public.geocoding_cache ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to read cache
CREATE POLICY "Allow authenticated users to read geocoding cache"
  ON public.geocoding_cache
  FOR SELECT
  TO authenticated
  USING (true);

-- Allow all authenticated users to insert into cache
CREATE POLICY "Allow authenticated users to insert geocoding cache"
  ON public.geocoding_cache
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Allow service role to update cache
CREATE POLICY "Allow service role to update geocoding cache"
  ON public.geocoding_cache
  FOR UPDATE
  TO service_role
  USING (true);

-- Create route cache table
CREATE TABLE IF NOT EXISTS public.route_cache (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  start_lat numeric(10, 7) NOT NULL,
  start_lon numeric(10, 7) NOT NULL,
  end_lat numeric(10, 7) NOT NULL,
  end_lon numeric(10, 7) NOT NULL,
  distance_miles numeric(10, 2) NOT NULL,
  distance_meters numeric(10, 2),
  duration_seconds integer,
  created_at timestamptz DEFAULT now(),
  hit_count integer DEFAULT 0,
  UNIQUE(start_lat, start_lon, end_lat, end_lon)
);

-- Create index for route cache lookups
CREATE INDEX IF NOT EXISTS idx_route_cache_coords 
  ON public.route_cache(start_lat, start_lon, end_lat, end_lon);

-- Enable RLS
ALTER TABLE public.route_cache ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to read cache
CREATE POLICY "Allow authenticated users to read route cache"
  ON public.route_cache
  FOR SELECT
  TO authenticated
  USING (true);

-- Allow all authenticated users to insert into cache
CREATE POLICY "Allow authenticated users to insert route cache"
  ON public.route_cache
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Allow service role to update cache
CREATE POLICY "Allow service role to update route cache"
  ON public.route_cache
  FOR UPDATE
  TO service_role
  USING (true);