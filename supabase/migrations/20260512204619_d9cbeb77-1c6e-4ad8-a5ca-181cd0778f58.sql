CREATE INDEX IF NOT EXISTS idx_pickup_drops_lat_lng
ON public.pickup_drops (latitude, longitude)
WHERE latitude IS NOT NULL AND longitude IS NOT NULL;