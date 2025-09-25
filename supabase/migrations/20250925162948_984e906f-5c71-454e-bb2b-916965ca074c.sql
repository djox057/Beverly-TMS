-- Add company_id column to trucks table
ALTER TABLE public.trucks 
ADD COLUMN company_id uuid REFERENCES public.companies(id);

-- Add index for better performance on company lookups
CREATE INDEX idx_trucks_company_id ON public.trucks(company_id);