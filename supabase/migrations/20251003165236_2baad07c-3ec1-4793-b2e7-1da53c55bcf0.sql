-- Create truck_files table
CREATE TABLE public.truck_files (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  truck_id UUID NOT NULL REFERENCES public.trucks(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER,
  content_type TEXT,
  uploaded_by TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create trailer_files table
CREATE TABLE public.trailer_files (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  trailer_id UUID NOT NULL REFERENCES public.trailers(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER,
  content_type TEXT,
  uploaded_by TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.truck_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trailer_files ENABLE ROW LEVEL SECURITY;

-- Create policies for truck_files
CREATE POLICY "Authenticated users can view truck_files"
  ON public.truck_files
  FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can create truck_files"
  ON public.truck_files
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update truck_files"
  ON public.truck_files
  FOR UPDATE
  USING (true);

CREATE POLICY "Admins can delete truck_files"
  ON public.truck_files
  FOR DELETE
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Create policies for trailer_files
CREATE POLICY "Authenticated users can view trailer_files"
  ON public.trailer_files
  FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can create trailer_files"
  ON public.trailer_files
  FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update trailer_files"
  ON public.trailer_files
  FOR UPDATE
  USING (true);

CREATE POLICY "Admins can delete trailer_files"
  ON public.trailer_files
  FOR DELETE
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Create updated_at triggers
CREATE TRIGGER update_truck_files_updated_at
  BEFORE UPDATE ON public.truck_files
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_trailer_files_updated_at
  BEFORE UPDATE ON public.trailer_files
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create storage buckets
INSERT INTO storage.buckets (id, name, public)
VALUES ('truck-files', 'truck-files', true)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('trailer-files', 'trailer-files', true)
ON CONFLICT (id) DO NOTHING;