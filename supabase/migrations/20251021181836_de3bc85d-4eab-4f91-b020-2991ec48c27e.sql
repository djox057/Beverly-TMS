-- Populate truck_note_history with existing notes (only for trucks that still exist)
INSERT INTO public.truck_note_history (truck_id, note, edited_by, edited_at)
SELECT 
  tn.truck_id,
  tn.note,
  tn.updated_by,
  tn.updated_at
FROM public.truck_notes tn
INNER JOIN public.trucks t ON t.id = tn.truck_id
WHERE tn.note IS NOT NULL AND tn.note != ''
ON CONFLICT DO NOTHING;