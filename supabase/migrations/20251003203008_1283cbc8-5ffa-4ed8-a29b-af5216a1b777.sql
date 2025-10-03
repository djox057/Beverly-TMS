-- Add CREATE permission for orders (safety can create orders)
CREATE POLICY "Safety can create orders" 
ON public.orders 
FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'safety'));

-- Add full management permissions for trucks (safety can manage trucks)
CREATE POLICY "Safety can create trucks" 
ON public.trucks 
FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'safety'));

CREATE POLICY "Safety can update trucks" 
ON public.trucks 
FOR UPDATE 
USING (has_role(auth.uid(), 'safety'));

CREATE POLICY "Safety can delete trucks" 
ON public.trucks 
FOR DELETE 
USING (has_role(auth.uid(), 'safety'));

-- Add full management permissions for drivers (safety can manage drivers)
CREATE POLICY "Safety can create drivers" 
ON public.drivers 
FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'safety'));

CREATE POLICY "Safety can update drivers" 
ON public.drivers 
FOR UPDATE 
USING (has_role(auth.uid(), 'safety'));

CREATE POLICY "Safety can delete drivers" 
ON public.drivers 
FOR DELETE 
USING (has_role(auth.uid(), 'safety'));