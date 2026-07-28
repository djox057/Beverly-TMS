CREATE TABLE public.driver_yard_action_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  yard_action_id uuid NOT NULL REFERENCES public.driver_yard_actions(id) ON DELETE CASCADE,
  content text NOT NULL,
  author_id uuid,
  author_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_dyac_yard_action_id ON public.driver_yard_action_comments(yard_action_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.driver_yard_action_comments TO authenticated;
GRANT ALL ON public.driver_yard_action_comments TO service_role;

ALTER TABLE public.driver_yard_action_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read yard action comments"
ON public.driver_yard_action_comments FOR SELECT TO authenticated USING (true);

CREATE POLICY "Managers and admins can add yard action comments"
ON public.driver_yard_action_comments FOR INSERT TO authenticated
WITH CHECK (
  author_id = auth.uid()
  AND (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'manager'))
);

CREATE POLICY "Authors can update own yard action comments"
ON public.driver_yard_action_comments FOR UPDATE TO authenticated
USING (author_id = auth.uid())
WITH CHECK (author_id = auth.uid());

CREATE POLICY "Authors or admins can delete yard action comments"
ON public.driver_yard_action_comments FOR DELETE TO authenticated
USING (author_id = auth.uid() OR public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER update_driver_yard_action_comments_updated_at
BEFORE UPDATE ON public.driver_yard_action_comments
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();