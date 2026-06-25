
CREATE TABLE public.dispatcher_tier_comments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  dispatcher_id UUID NOT NULL,
  parent_id UUID REFERENCES public.dispatcher_tier_comments(id) ON DELETE CASCADE,
  author_id UUID,
  author_name TEXT,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX dispatcher_tier_comments_dispatcher_idx ON public.dispatcher_tier_comments(dispatcher_id);
CREATE INDEX dispatcher_tier_comments_parent_idx ON public.dispatcher_tier_comments(parent_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dispatcher_tier_comments TO authenticated;
GRANT ALL ON public.dispatcher_tier_comments TO service_role;

ALTER TABLE public.dispatcher_tier_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated can read dispatcher tier comments"
  ON public.dispatcher_tier_comments FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated can insert dispatcher tier comments"
  ON public.dispatcher_tier_comments FOR INSERT TO authenticated WITH CHECK (auth.uid() = author_id);
CREATE POLICY "Authors can update own dispatcher tier comments"
  ON public.dispatcher_tier_comments FOR UPDATE TO authenticated USING (auth.uid() = author_id) WITH CHECK (auth.uid() = author_id);
CREATE POLICY "Authors can delete own dispatcher tier comments"
  ON public.dispatcher_tier_comments FOR DELETE TO authenticated USING (auth.uid() = author_id);
