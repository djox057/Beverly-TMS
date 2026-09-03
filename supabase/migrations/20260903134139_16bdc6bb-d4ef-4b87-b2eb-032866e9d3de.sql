ALTER TABLE public.trailer_files ADD COLUMN IF NOT EXISTS keywords text[];

CREATE INDEX IF NOT EXISTS idx_trailer_files_keywords ON public.trailer_files USING GIN (keywords);

UPDATE public.trailer_files SET keywords = ARRAY['dot','annual dot','dot inspection','annual inspection']
WHERE (keywords IS NULL OR array_length(keywords,1) IS NULL) AND (file_name ~* '\ydot\y' OR file_name ~* 'annual' OR file_name ~* 'inspection');

UPDATE public.trailer_files SET keywords = ARRAY['registration','cab card','vehicle registration','irp']
WHERE (keywords IS NULL OR array_length(keywords,1) IS NULL) AND (file_name ~* 'cab[ _-]*card' OR file_name ~* 'cabcard' OR file_name ~* 'reg(istration)?' OR file_name ~* '\yirp\y' OR file_name ~* 'apportion');