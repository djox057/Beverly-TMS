-- Create storage bucket for order files
INSERT INTO storage.buckets (id, name, public) VALUES ('order-files', 'order-files', false);

-- Create table to track order files
CREATE TABLE public.order_files (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INTEGER,
  content_type TEXT,
  uploaded_by TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on order_files table
ALTER TABLE public.order_files ENABLE ROW LEVEL SECURITY;

-- Create policies for order_files
CREATE POLICY "Allow all operations on order_files" 
ON public.order_files 
FOR ALL 
USING (true);

-- Create storage policies for order-files bucket
CREATE POLICY "Allow authenticated uploads to order-files"
ON storage.objects
FOR INSERT
WITH CHECK (bucket_id = 'order-files' AND auth.uid() IS NOT NULL);

CREATE POLICY "Allow authenticated users to view order files"
ON storage.objects
FOR SELECT
USING (bucket_id = 'order-files' AND auth.uid() IS NOT NULL);

CREATE POLICY "Allow authenticated users to delete order files"
ON storage.objects
FOR DELETE
USING (bucket_id = 'order-files' AND auth.uid() IS NOT NULL);

-- Create trigger for updating timestamps
CREATE TRIGGER update_order_files_updated_at
BEFORE UPDATE ON public.order_files
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();