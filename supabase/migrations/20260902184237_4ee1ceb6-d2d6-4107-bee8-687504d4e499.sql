ALTER TABLE public.truck_files ADD COLUMN IF NOT EXISTS folder text;

CREATE TABLE IF NOT EXISTS public.truck_file_folders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  truck_id uuid NOT NULL REFERENCES public.trucks(id) ON DELETE CASCADE,
  name text NOT NULL,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (truck_id, name)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.truck_file_folders TO authenticated;
GRANT ALL ON public.truck_file_folders TO service_role;

ALTER TABLE public.truck_file_folders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Roles can view truck_file_folders" ON public.truck_file_folders;
CREATE POLICY "Roles can view truck_file_folders" ON public.truck_file_folders
FOR SELECT USING (has_any_role(ARRAY['dispatch'::app_role, 'afterhours'::app_role, 'manager'::app_role, 'admin'::app_role, 'accounting'::app_role, 'supervisor'::app_role, 'safety'::app_role, 'maintenance'::app_role, 'chicago_management'::app_role]));

DROP POLICY IF EXISTS "Roles can create truck_file_folders" ON public.truck_file_folders;
CREATE POLICY "Roles can create truck_file_folders" ON public.truck_file_folders
FOR INSERT WITH CHECK (has_any_role(ARRAY['manager'::app_role, 'admin'::app_role, 'accounting'::app_role, 'supervisor'::app_role, 'safety'::app_role, 'maintenance'::app_role]));

DROP POLICY IF EXISTS "Roles can update truck_file_folders" ON public.truck_file_folders;
CREATE POLICY "Roles can update truck_file_folders" ON public.truck_file_folders
FOR UPDATE USING (has_any_role(ARRAY['manager'::app_role, 'admin'::app_role, 'accounting'::app_role, 'supervisor'::app_role, 'safety'::app_role, 'maintenance'::app_role]));

DROP POLICY IF EXISTS "Roles can delete truck_file_folders" ON public.truck_file_folders;
CREATE POLICY "Roles can delete truck_file_folders" ON public.truck_file_folders
FOR DELETE USING (has_any_role(ARRAY['admin'::app_role, 'accounting'::app_role, 'safety'::app_role, 'maintenance'::app_role]));

CREATE INDEX IF NOT EXISTS idx_truck_file_folders_truck ON public.truck_file_folders(truck_id);
CREATE INDEX IF NOT EXISTS idx_truck_files_truck_folder ON public.truck_files(truck_id, folder);

DROP TRIGGER IF EXISTS update_truck_file_folders_updated_at ON public.truck_file_folders;
CREATE TRIGGER update_truck_file_folders_updated_at
BEFORE UPDATE ON public.truck_file_folders
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();