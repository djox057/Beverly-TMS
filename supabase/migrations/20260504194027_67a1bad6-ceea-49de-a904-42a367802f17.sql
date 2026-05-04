CREATE TABLE public.final_update_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  truck_id uuid NOT NULL,
  driver_id uuid,
  send_date date NOT NULL,
  truck_number text,
  driver_name text,
  note text,
  sent_at timestamptz NOT NULL DEFAULT now(),
  sent_by uuid,
  UNIQUE (truck_id, send_date)
);

ALTER TABLE public.final_update_sends ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can view final updates"
ON public.final_update_sends FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Authenticated can insert final updates"
ON public.final_update_sends FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE INDEX idx_final_update_sends_date ON public.final_update_sends(send_date);