CREATE TABLE public.daily_report_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  truck TEXT,
  note TEXT,
  driver_name TEXT,
  dispatcher_name TEXT,
  office TEXT,
  type TEXT,
  date DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID
);

CREATE INDEX idx_daily_report_entries_date ON public.daily_report_entries(date);
CREATE INDEX idx_daily_report_entries_office_type ON public.daily_report_entries(office, type, date);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.daily_report_entries TO authenticated;
GRANT ALL ON public.daily_report_entries TO service_role;

ALTER TABLE public.daily_report_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view daily report entries"
ON public.daily_report_entries FOR SELECT TO authenticated USING (true);

CREATE POLICY "Authenticated can insert daily report entries"
ON public.daily_report_entries FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated can update daily report entries"
ON public.daily_report_entries FOR UPDATE TO authenticated USING (true);

CREATE POLICY "Authenticated can delete daily report entries"
ON public.daily_report_entries FOR DELETE TO authenticated USING (true);

CREATE TRIGGER update_daily_report_entries_updated_at
BEFORE UPDATE ON public.daily_report_entries
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();