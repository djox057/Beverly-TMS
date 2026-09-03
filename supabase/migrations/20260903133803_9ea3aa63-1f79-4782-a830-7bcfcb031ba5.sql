ALTER TABLE public.truck_files ADD COLUMN IF NOT EXISTS keywords text[];

CREATE INDEX IF NOT EXISTS idx_truck_files_keywords ON public.truck_files USING GIN (keywords);

-- One-time backfill from file names (most specific first)
UPDATE public.truck_files SET keywords = ARRAY['registration_affirmation','registration affirmation','affirmation','registration']
WHERE (keywords IS NULL OR array_length(keywords,1) IS NULL) AND file_name ~* 'affirm';

UPDATE public.truck_files SET keywords = ARRAY['annual_dot','annual dot','annual inspection','dot inspection','annual dot inspection']
WHERE (keywords IS NULL OR array_length(keywords,1) IS NULL) AND (file_name ~* 'annual' OR file_name ~* '\ydot\y[ _-]*(insp|inspection)');

UPDATE public.truck_files SET keywords = ARRAY['lease_agreement','lease agreement','lease','agreement']
WHERE (keywords IS NULL OR array_length(keywords,1) IS NULL) AND file_name ~* 'lease';

UPDATE public.truck_files SET keywords = ARRAY['ky_permit','ky permit','kentucky permit','kyu','permit']
WHERE (keywords IS NULL OR array_length(keywords,1) IS NULL) AND (file_name ~* 'kentucky' OR file_name ~* '\ykyu?\y');

UPDATE public.truck_files SET keywords = ARRAY['ny_permit','ny permit','new york permit','hut','permit']
WHERE (keywords IS NULL OR array_length(keywords,1) IS NULL) AND (file_name ~* 'new[ _-]*york' OR file_name ~* '\yhut\y' OR file_name ~* '\yny\y');

UPDATE public.truck_files SET keywords = ARRAY['nm_permit','nm permit','new mexico permit','permit']
WHERE (keywords IS NULL OR array_length(keywords,1) IS NULL) AND (file_name ~* 'new[ _-]*mexico' OR file_name ~* '\ynm\y');

UPDATE public.truck_files SET keywords = ARRAY['ifta_licence','ifta','ifta licence','ifta license','fuel tax licence']
WHERE (keywords IS NULL OR array_length(keywords,1) IS NULL) AND (file_name ~* '\yifta\y' OR file_name ~* 'fuel[ _-]*tax');

UPDATE public.truck_files SET keywords = ARRAY['registration','cab card','vehicle registration','irp']
WHERE (keywords IS NULL OR array_length(keywords,1) IS NULL) AND (file_name ~* 'cab[ _-]*card' OR file_name ~* 'cabcard' OR file_name ~* 'reg(istration)?' OR file_name ~* '\yirp\y' OR file_name ~* 'apportion');