CREATE TABLE public.driver_complaints (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  complaint_type TEXT NOT NULL,
  driver_id UUID REFERENCES public.drivers(id) ON DELETE SET NULL,
  truck_id UUID REFERENCES public.trucks(id) ON DELETE SET NULL,
  subject_text TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL,
  is_resolved BOOLEAN NOT NULL DEFAULT false,
  resolved_at TIMESTAMP WITH TIME ZONE,
  created_by UUID,
  created_by_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  CONSTRAINT driver_complaints_type_check CHECK (complaint_type IN ('hos','gross_rpm','dispatcher','recruiting','accounting','maintenance','trucks','other'))
);

CREATE TABLE public.driver_complaint_comments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  complaint_id UUID NOT NULL REFERENCES public.driver_complaints(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  author_id UUID,
  author_name TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_driver_complaints_type_created ON public.driver_complaints(complaint_type, created_at DESC);
CREATE INDEX idx_driver_complaint_comments_complaint ON public.driver_complaint_comments(complaint_id, created_at);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.driver_complaints TO authenticated;
GRANT ALL ON public.driver_complaints TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.driver_complaint_comments TO authenticated;
GRANT ALL ON public.driver_complaint_comments TO service_role;

ALTER TABLE public.driver_complaints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_complaint_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins and managers can view complaints"
ON public.driver_complaints FOR SELECT TO authenticated
USING (public.has_any_role(ARRAY['admin','manager']::app_role[]));

CREATE POLICY "Admins and managers can insert complaints"
ON public.driver_complaints FOR INSERT TO authenticated
WITH CHECK (public.has_any_role(ARRAY['admin','manager']::app_role[]) AND created_by = auth.uid());

CREATE POLICY "Admins and managers can update complaints"
ON public.driver_complaints FOR UPDATE TO authenticated
USING (public.has_any_role(ARRAY['admin','manager']::app_role[]))
WITH CHECK (public.has_any_role(ARRAY['admin','manager']::app_role[]));

CREATE POLICY "Admins and managers can delete complaints"
ON public.driver_complaints FOR DELETE TO authenticated
USING (public.has_any_role(ARRAY['admin','manager']::app_role[]));

CREATE POLICY "Admins and managers can view complaint comments"
ON public.driver_complaint_comments FOR SELECT TO authenticated
USING (public.has_any_role(ARRAY['admin','manager']::app_role[]));

CREATE POLICY "Admins and managers can insert complaint comments"
ON public.driver_complaint_comments FOR INSERT TO authenticated
WITH CHECK (public.has_any_role(ARRAY['admin','manager']::app_role[]) AND author_id = auth.uid());

CREATE POLICY "Admins and managers can update complaint comments"
ON public.driver_complaint_comments FOR UPDATE TO authenticated
USING (public.has_any_role(ARRAY['admin','manager']::app_role[]) AND author_id = auth.uid())
WITH CHECK (public.has_any_role(ARRAY['admin','manager']::app_role[]) AND author_id = auth.uid());

CREATE POLICY "Admins and authors can delete complaint comments"
ON public.driver_complaint_comments FOR DELETE TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR (public.has_any_role(ARRAY['admin','manager']::app_role[]) AND author_id = auth.uid()));

CREATE TRIGGER update_driver_complaints_updated_at
BEFORE UPDATE ON public.driver_complaints
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();