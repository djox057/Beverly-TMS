CREATE TABLE public.paperwork_items (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  office text NOT NULL DEFAULT 'CHICAGO',
  unit_label text NOT NULL,
  last_day date,
  last_day_text text,
  reason text,
  note text,
  is_ready boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.paperwork_items TO authenticated;
GRANT ALL ON public.paperwork_items TO service_role;

ALTER TABLE public.paperwork_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view paperwork items"
ON public.paperwork_items FOR SELECT TO authenticated USING (true);

CREATE POLICY "Safety staff can insert paperwork items"
ON public.paperwork_items FOR INSERT TO authenticated
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager') OR public.has_role(auth.uid(), 'safety') OR public.has_role(auth.uid(), 'maintenance'));

CREATE POLICY "Safety staff can update paperwork items"
ON public.paperwork_items FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager') OR public.has_role(auth.uid(), 'safety') OR public.has_role(auth.uid(), 'maintenance'));

CREATE POLICY "Safety staff can delete paperwork items"
ON public.paperwork_items FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager') OR public.has_role(auth.uid(), 'safety') OR public.has_role(auth.uid(), 'maintenance'));

CREATE TRIGGER update_paperwork_items_updated_at
BEFORE UPDATE ON public.paperwork_items
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_paperwork_items_last_day ON public.paperwork_items (last_day);