WITH ranked AS (
  SELECT id,
         row_number() OVER (PARTITION BY order_id, type, sequence_number ORDER BY created_at NULLS LAST, id::text) AS rn
  FROM public.pickup_drops
)
DELETE FROM public.pickup_drops pd
USING ranked r
WHERE pd.id = r.id
  AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS pickup_drops_order_type_seq_uidx
  ON public.pickup_drops (order_id, type, sequence_number);