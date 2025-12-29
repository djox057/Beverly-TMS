-- Create proximity tracking table to track when trucks enter 5-mile radius
CREATE TABLE public.proximity_tracking (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  truck_id UUID NOT NULL REFERENCES trucks(id) ON DELETE CASCADE,
  stop_id UUID NOT NULL REFERENCES pickup_drops(id) ON DELETE CASCADE,
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  entered_radius_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(truck_id, stop_id)
);

-- Enable RLS
ALTER TABLE public.proximity_tracking ENABLE ROW LEVEL SECURITY;

-- Allow system/edge functions full access
CREATE POLICY "System can select proximity tracking"
ON public.proximity_tracking
FOR SELECT
USING (true);

CREATE POLICY "System can insert proximity tracking"
ON public.proximity_tracking
FOR INSERT
WITH CHECK (true);

CREATE POLICY "System can update proximity tracking"
ON public.proximity_tracking
FOR UPDATE
USING (true);

CREATE POLICY "System can delete proximity tracking"
ON public.proximity_tracking
FOR DELETE
USING (true);

-- Index for efficient lookups
CREATE INDEX idx_proximity_tracking_truck_stop ON public.proximity_tracking(truck_id, stop_id);
CREATE INDEX idx_proximity_tracking_entered_at ON public.proximity_tracking(entered_radius_at);