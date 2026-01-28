-- Create daily_driver_stats table for immutable daily snapshots
CREATE TABLE public.daily_driver_stats (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL,
  driver_id uuid NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  dispatcher_id uuid NOT NULL,
  office text NOT NULL,
  
  -- The three boolean flags for each type
  has_lost_day boolean DEFAULT false,
  has_home_time boolean DEFAULT false,
  has_reschedule boolean DEFAULT false,
  
  -- Optional metadata
  lost_day_note text,
  reschedule_order_id uuid REFERENCES public.orders(id) ON DELETE SET NULL,
  
  -- Timestamps
  recorded_at timestamptz DEFAULT now(),
  
  -- One record per driver per day
  CONSTRAINT daily_driver_stats_unique UNIQUE(date, driver_id)
);

-- Indexes for efficient queries
CREATE INDEX idx_daily_driver_stats_date ON public.daily_driver_stats(date);
CREATE INDEX idx_daily_driver_stats_dispatcher ON public.daily_driver_stats(dispatcher_id);
CREATE INDEX idx_daily_driver_stats_office ON public.daily_driver_stats(office);
CREATE INDEX idx_daily_driver_stats_date_office ON public.daily_driver_stats(date, office);

-- Enable RLS
ALTER TABLE public.daily_driver_stats ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Allow read for authenticated users" 
ON public.daily_driver_stats
FOR SELECT TO authenticated 
USING (true);

CREATE POLICY "Allow insert for authenticated users" 
ON public.daily_driver_stats
FOR INSERT TO authenticated 
WITH CHECK (true);

CREATE POLICY "Allow update for authenticated users" 
ON public.daily_driver_stats
FOR UPDATE TO authenticated 
USING (true);

-- Add comment for documentation
COMMENT ON TABLE public.daily_driver_stats IS 'Immutable daily snapshots of driver stats (lost days, home time, reschedules) recorded at 23:59 Chicago time for Analytics coverage calculations';