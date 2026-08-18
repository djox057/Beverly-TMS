CREATE TABLE public.document_reminder_log (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  entity_type text NOT NULL,
  entity_id uuid,
  entity_label text,
  field_key text NOT NULL,
  milestone integer NOT NULL,
  due_date date,
  send_date date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Chicago')::date,
  sent_to text,
  sent_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.document_reminder_log TO authenticated;
GRANT ALL ON public.document_reminder_log TO service_role;

ALTER TABLE public.document_reminder_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins safety and maintenance can view reminder log"
ON public.document_reminder_log FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR public.has_role(auth.uid(), 'manager')
  OR public.has_role(auth.uid(), 'safety')
  OR public.has_role(auth.uid(), 'maintenance')
);

CREATE UNIQUE INDEX document_reminder_log_unique_milestone
ON public.document_reminder_log (entity_type, entity_id, field_key, milestone, due_date)
WHERE milestone > 0;

CREATE UNIQUE INDEX document_reminder_log_unique_overdue
ON public.document_reminder_log (entity_type, entity_id, field_key, send_date)
WHERE milestone <= 0;

CREATE INDEX document_reminder_log_sent_at_idx ON public.document_reminder_log (sent_at DESC);