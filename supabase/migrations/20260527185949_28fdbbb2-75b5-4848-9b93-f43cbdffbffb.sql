
CREATE TABLE public.daily_report_permissions (
  user_id uuid PRIMARY KEY,
  can_view boolean NOT NULL DEFAULT false,
  can_edit boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.daily_report_permissions TO authenticated;
GRANT ALL ON public.daily_report_permissions TO service_role;

ALTER TABLE public.daily_report_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own daily report permissions"
  ON public.daily_report_permissions
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Admins and accounting can view all daily report permissions"
  ON public.daily_report_permissions
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'accounting'::app_role));

CREATE POLICY "Admins and accounting can insert daily report permissions"
  ON public.daily_report_permissions
  FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'accounting'::app_role));

CREATE POLICY "Admins and accounting can update daily report permissions"
  ON public.daily_report_permissions
  FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'accounting'::app_role));

CREATE POLICY "Admins and accounting can delete daily report permissions"
  ON public.daily_report_permissions
  FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'accounting'::app_role));

CREATE TRIGGER trg_daily_report_permissions_updated_at
  BEFORE UPDATE ON public.daily_report_permissions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
