ALTER TABLE public.driver_complaints DROP CONSTRAINT driver_complaints_type_check;
ALTER TABLE public.driver_complaints ADD CONSTRAINT driver_complaints_type_check CHECK (complaint_type = ANY (ARRAY['hos','gross_rpm','dispatcher','recruiting','accounting','maintenance','trucks','other','dispatcher_reporting']));

ALTER TABLE public.driver_complaints ADD COLUMN IF NOT EXISTS source_complaint_id uuid REFERENCES public.driver_complaints(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_driver_complaints_source ON public.driver_complaints(source_complaint_id);

CREATE POLICY "Dispatch can view own reportings"
ON public.driver_complaints FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'dispatch') AND created_by = auth.uid() AND complaint_type = 'dispatcher_reporting' AND source_complaint_id IS NULL);

CREATE POLICY "Dispatch can insert own reportings"
ON public.driver_complaints FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'dispatch') AND created_by = auth.uid() AND complaint_type = 'dispatcher_reporting' AND source_complaint_id IS NULL);

CREATE POLICY "Dispatch can update own reportings"
ON public.driver_complaints FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'dispatch') AND created_by = auth.uid() AND complaint_type = 'dispatcher_reporting' AND source_complaint_id IS NULL)
WITH CHECK (has_role(auth.uid(), 'dispatch') AND created_by = auth.uid() AND complaint_type = 'dispatcher_reporting' AND source_complaint_id IS NULL);

CREATE POLICY "Dispatch can delete own reportings"
ON public.driver_complaints FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'dispatch') AND created_by = auth.uid() AND complaint_type = 'dispatcher_reporting' AND source_complaint_id IS NULL);

CREATE POLICY "Dispatch can view comments on own complaints"
ON public.driver_complaint_comments FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'dispatch') AND EXISTS (
  SELECT 1 FROM public.driver_complaints dc
  WHERE dc.id = complaint_id AND dc.created_by = auth.uid() AND dc.complaint_type = 'dispatcher_reporting' AND dc.source_complaint_id IS NULL
));

CREATE POLICY "Dispatch can insert comments on own complaints"
ON public.driver_complaint_comments FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'dispatch') AND author_id = auth.uid() AND EXISTS (
  SELECT 1 FROM public.driver_complaints dc
  WHERE dc.id = complaint_id AND dc.created_by = auth.uid() AND dc.complaint_type = 'dispatcher_reporting' AND dc.source_complaint_id IS NULL
));

CREATE POLICY "Dispatch can delete own comments"
ON public.driver_complaint_comments FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'dispatch') AND author_id = auth.uid());