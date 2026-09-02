ALTER TABLE public.trailer_files ADD COLUMN IF NOT EXISTS folder text;

CREATE TABLE IF NOT EXISTS public.trailer_file_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trailer_id uuid NOT NULL REFERENCES public.trailers(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (trailer_id, name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.trailer_file_folders TO authenticated;
GRANT ALL ON public.trailer_file_folders TO service_role;

ALTER TABLE public.trailer_file_folders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Roles can view trailer_file_folders" ON public.trailer_file_folders;
CREATE POLICY "Roles can view trailer_file_folders" ON public.trailer_file_folders
FOR SELECT USING (has_any_role(ARRAY['dispatch'::app_role, 'afterhours'::app_role, 'manager'::app_role, 'admin'::app_role, 'accounting'::app_role, 'supervisor'::app_role, 'safety'::app_role, 'maintenance'::app_role, 'chicago_management'::app_role]));

DROP POLICY IF EXISTS "Roles can create trailer_file_folders" ON public.trailer_file_folders;
CREATE POLICY "Roles can create trailer_file_folders" ON public.trailer_file_folders
FOR INSERT WITH CHECK (has_any_role(ARRAY['manager'::app_role, 'admin'::app_role, 'accounting'::app_role, 'supervisor'::app_role, 'safety'::app_role, 'maintenance'::app_role]));

DROP POLICY IF EXISTS "Roles can update trailer_file_folders" ON public.trailer_file_folders;
CREATE POLICY "Roles can update trailer_file_folders" ON public.trailer_file_folders
FOR UPDATE USING (has_any_role(ARRAY['manager'::app_role, 'admin'::app_role, 'accounting'::app_role, 'supervisor'::app_role, 'safety'::app_role, 'maintenance'::app_role]));

DROP POLICY IF EXISTS "Roles can delete trailer_file_folders" ON public.trailer_file_folders;
CREATE POLICY "Roles can delete trailer_file_folders" ON public.trailer_file_folders
FOR DELETE USING (has_any_role(ARRAY['admin'::app_role, 'accounting'::app_role, 'safety'::app_role, 'maintenance'::app_role]));

CREATE INDEX IF NOT EXISTS idx_trailer_file_folders_trailer ON public.trailer_file_folders(trailer_id);
CREATE INDEX IF NOT EXISTS idx_trailer_files_trailer_folder ON public.trailer_files(trailer_id, folder);

DROP TRIGGER IF EXISTS update_trailer_file_folders_updated_at ON public.trailer_file_folders;
CREATE TRIGGER update_trailer_file_folders_updated_at
BEFORE UPDATE ON public.trailer_file_folders
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();