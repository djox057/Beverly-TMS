
-- Main table for precomputed locked order aggregates
CREATE TABLE public.analytics_locked_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  entity_name TEXT,
  date DATE NOT NULL,
  date_type TEXT NOT NULL,
  total_freight NUMERIC DEFAULT 0,
  total_driver_pay NUMERIC DEFAULT 0,
  total_miles NUMERIC DEFAULT 0,
  total_dh_miles NUMERIC DEFAULT 0,
  order_count INT DEFAULT 0,
  is_company_driver BOOLEAN DEFAULT false,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (entity_type, entity_id, date, date_type)
);

-- Range query index for frontend: WHERE entity_type = X AND date_type = Y AND date BETWEEN ...
CREATE INDEX idx_analytics_locked_daily_range ON public.analytics_locked_daily (entity_type, date_type, date);

-- Staging table (same schema) for zero-downtime swap rebuilds
CREATE TABLE public.analytics_locked_daily_staging (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  entity_name TEXT,
  date DATE NOT NULL,
  date_type TEXT NOT NULL,
  total_freight NUMERIC DEFAULT 0,
  total_driver_pay NUMERIC DEFAULT 0,
  total_miles NUMERIC DEFAULT 0,
  total_dh_miles NUMERIC DEFAULT 0,
  order_count INT DEFAULT 0,
  is_company_driver BOOLEAN DEFAULT false,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (entity_type, entity_id, date, date_type)
);

CREATE INDEX idx_analytics_locked_daily_staging_range ON public.analytics_locked_daily_staging (entity_type, date_type, date);

-- No RLS - accessed only via service role from edge functions
ALTER TABLE public.analytics_locked_daily DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_locked_daily_staging DISABLE ROW LEVEL SECURITY;
