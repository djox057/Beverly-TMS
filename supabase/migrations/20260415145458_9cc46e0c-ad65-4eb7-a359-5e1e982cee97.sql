
-- Create temporary_plates table
CREATE TABLE public.temporary_plates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  truck_id UUID NOT NULL REFERENCES public.trucks(id) ON DELETE CASCADE,
  added_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.temporary_plates ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Authenticated users can view temporary_plates"
  ON public.temporary_plates FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin/safety/maintenance can insert temporary_plates"
  ON public.temporary_plates FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(ARRAY['admin'::app_role, 'safety'::app_role, 'maintenance'::app_role]));

CREATE POLICY "Admin/safety/maintenance can update temporary_plates"
  ON public.temporary_plates FOR UPDATE TO authenticated
  USING (public.has_any_role(ARRAY['admin'::app_role, 'safety'::app_role, 'maintenance'::app_role]));

CREATE POLICY "Admin/safety/maintenance can delete temporary_plates"
  ON public.temporary_plates FOR DELETE TO authenticated
  USING (public.has_any_role(ARRAY['admin'::app_role, 'safety'::app_role, 'maintenance'::app_role]));

-- Create storage bucket for temporary plate pictures
INSERT INTO storage.buckets (id, name, public) VALUES ('temporary-plate-files', 'temporary-plate-files', false);

-- Storage policies
CREATE POLICY "Auth users can view temp plate files"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'temporary-plate-files');

CREATE POLICY "Admin/safety/maintenance can upload temp plate files"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'temporary-plate-files' AND public.has_any_role(ARRAY['admin'::app_role, 'safety'::app_role, 'maintenance'::app_role]));

CREATE POLICY "Admin/safety/maintenance can delete temp plate files"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'temporary-plate-files' AND public.has_any_role(ARRAY['admin'::app_role, 'safety'::app_role, 'maintenance'::app_role]));

-- Trigger for updated_at
CREATE TRIGGER update_temporary_plates_updated_at
  BEFORE UPDATE ON public.temporary_plates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
