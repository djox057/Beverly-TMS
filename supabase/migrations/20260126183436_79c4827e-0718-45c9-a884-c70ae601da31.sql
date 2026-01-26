-- Create analytics_dispatcher_period table for pre-aggregated analytics
CREATE TABLE public.analytics_dispatcher_period (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dispatcher_id uuid NOT NULL,
  dispatcher_name text NOT NULL,
  office text,
  period_type text NOT NULL CHECK (period_type IN ('week', 'month')),
  period_start date NOT NULL,
  period_end date NOT NULL,
  total_freight numeric NOT NULL DEFAULT 0,
  total_driver_rate numeric NOT NULL DEFAULT 0,
  dispatcher_cut numeric NOT NULL DEFAULT 0,
  dispatcher_cut_percent numeric NOT NULL DEFAULT 0,
  total_miles integer NOT NULL DEFAULT 0,
  rate_per_mile numeric NOT NULL DEFAULT 0,
  order_count integer NOT NULL DEFAULT 0,
  avg_trucks numeric NOT NULL DEFAULT 0,
  last_calculated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (dispatcher_id, period_type, period_start)
);

-- Create index for fast filtering
CREATE INDEX idx_analytics_dispatcher_period_lookup 
ON public.analytics_dispatcher_period (period_type, period_start, period_end);

CREATE INDEX idx_analytics_dispatcher_period_dispatcher 
ON public.analytics_dispatcher_period (dispatcher_id);

CREATE INDEX idx_analytics_dispatcher_period_office 
ON public.analytics_dispatcher_period (office) WHERE office IS NOT NULL;

-- Create table for overall totals (for quick summary cards)
CREATE TABLE public.analytics_period_totals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_type text NOT NULL CHECK (period_type IN ('week', 'month')),
  period_start date NOT NULL,
  period_end date NOT NULL,
  office text,
  total_freight numeric NOT NULL DEFAULT 0,
  total_driver_rate numeric NOT NULL DEFAULT 0,
  total_cut numeric NOT NULL DEFAULT 0,
  total_cut_percent numeric NOT NULL DEFAULT 0,
  total_miles integer NOT NULL DEFAULT 0,
  rate_per_mile numeric NOT NULL DEFAULT 0,
  order_count integer NOT NULL DEFAULT 0,
  last_calculated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (period_type, period_start, office)
);

CREATE INDEX idx_analytics_period_totals_lookup 
ON public.analytics_period_totals (period_type, period_start, period_end);

-- Create table to track calculation status
CREATE TABLE public.analytics_calculation_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  period_type text NOT NULL,
  period_start date NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'calculating', 'completed', 'failed')),
  orders_processed integer DEFAULT 0,
  error_message text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.analytics_dispatcher_period ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_period_totals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_calculation_log ENABLE ROW LEVEL SECURITY;

-- RLS policies for analytics_dispatcher_period
-- Admins and managers can see all
CREATE POLICY "Admins and managers can view all analytics"
ON public.analytics_dispatcher_period FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin') OR 
  public.has_role(auth.uid(), 'manager') OR
  public.has_role(auth.uid(), 'accounting') OR
  public.has_role(auth.uid(), 'chicago_management')
);

-- Supervisors can see their office (cast office_location enum to text for comparison)
CREATE POLICY "Supervisors can view office analytics"
ON public.analytics_dispatcher_period FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'supervisor') AND
  office = (SELECT office::text FROM public.profiles WHERE user_id = auth.uid())
);

-- Dispatchers can see their own
CREATE POLICY "Dispatchers can view own analytics"
ON public.analytics_dispatcher_period FOR SELECT
TO authenticated
USING (
  (public.has_role(auth.uid(), 'dispatch') OR public.has_role(auth.uid(), 'afterhours')) AND
  dispatcher_id = auth.uid()
);

-- Safety role can view all
CREATE POLICY "Safety can view all analytics"
ON public.analytics_dispatcher_period FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'safety'));

-- RLS policies for analytics_period_totals
CREATE POLICY "Authenticated users can view period totals"
ON public.analytics_period_totals FOR SELECT
TO authenticated
USING (true);

-- RLS policies for analytics_calculation_log
CREATE POLICY "Admins can view calculation logs"
ON public.analytics_calculation_log FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'));

-- Trigger for updated_at
CREATE TRIGGER update_analytics_dispatcher_period_updated_at
BEFORE UPDATE ON public.analytics_dispatcher_period
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_analytics_period_totals_updated_at
BEFORE UPDATE ON public.analytics_period_totals
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();