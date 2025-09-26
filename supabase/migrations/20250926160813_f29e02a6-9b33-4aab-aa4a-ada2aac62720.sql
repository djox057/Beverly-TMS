-- Create a table for truck report notes
CREATE TABLE public.truck_notes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  truck_id UUID NOT NULL,
  note TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_by UUID REFERENCES auth.users(id)
);

-- Enable Row Level Security
ALTER TABLE public.truck_notes ENABLE ROW LEVEL SECURITY;

-- Create policies for truck notes
CREATE POLICY "Authenticated users can view truck notes" 
ON public.truck_notes 
FOR SELECT 
USING (true);

CREATE POLICY "Authenticated users can create truck notes" 
ON public.truck_notes 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Authenticated users can update truck notes" 
ON public.truck_notes 
FOR UPDATE 
USING (true);

CREATE POLICY "Admins can delete truck notes" 
ON public.truck_notes 
FOR DELETE 
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_truck_notes_updated_at
BEFORE UPDATE ON public.truck_notes
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for better performance
CREATE INDEX idx_truck_notes_truck_id ON public.truck_notes(truck_id);
CREATE INDEX idx_truck_notes_updated_at ON public.truck_notes(updated_at);