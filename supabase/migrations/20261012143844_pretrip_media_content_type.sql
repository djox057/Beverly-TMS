ALTER TABLE public.pretrip_photos ADD COLUMN content_type text;

-- Reuse existing Storage metadata without downloading or modifying file bytes.
UPDATE public.pretrip_photos p
SET content_type = o.metadata->>'mimetype'
FROM storage.objects o
WHERE o.bucket_id = 'pretrip-photos' AND o.name = p.file_path
  AND p.content_type IS NULL AND o.metadata->>'mimetype' IS NOT NULL;
