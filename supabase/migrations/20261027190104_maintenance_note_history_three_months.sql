ALTER POLICY "Read recent maintenance notes for visible trucks"
ON public.truck_maintenance_note_history
USING (changed_at >= now() - interval '3 months' AND EXISTS (
  SELECT 1 FROM public.trucks t WHERE t.id = truck_id
));
