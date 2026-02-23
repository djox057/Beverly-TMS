
-- Circuit breaker state table for edge function protection
CREATE TABLE public.circuit_breaker_state (
  function_name TEXT PRIMARY KEY,
  consecutive_failures INT NOT NULL DEFAULT 0,
  circuit_open_until TIMESTAMPTZ DEFAULT NULL,
  last_success_at TIMESTAMPTZ DEFAULT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- No RLS - only accessed via service role key from edge functions
ALTER TABLE public.circuit_breaker_state ENABLE ROW LEVEL SECURITY;

-- Seed with samsara-locations row
INSERT INTO public.circuit_breaker_state (function_name) VALUES ('samsara-locations');
