-- Create driver_files table
CREATE TABLE public.driver_files (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  driver_id UUID NOT NULL REFERENCES public.drivers(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER,
  content_type TEXT,
  uploaded_by TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.driver_files ENABLE ROW LEVEL SECURITY;

-- Create policies for driver_files
CREATE POLICY "Authenticated users can view driver_files"
  ON public.driver_files
  FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can create driver_files"
  ON public.driver_files
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update driver_files"
  ON public.driver_files
  FOR UPDATE
  USING (true);

CREATE POLICY "Admins can delete driver_files"
  ON public.driver_files
  FOR DELETE
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Create updated_at trigger
CREATE TRIGGER update_driver_files_updated_at
  BEFORE UPDATE ON public.driver_files
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create storage bucket for driver files if it doesn't exist
INSERT INTO storage.buckets (id, name, public)
VALUES ('driver-files', 'driver-files', true)
ON CONFLICT (id) DO NOTHING;