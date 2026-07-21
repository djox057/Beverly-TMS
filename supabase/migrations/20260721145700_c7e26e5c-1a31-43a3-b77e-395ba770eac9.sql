
GRANT SELECT ON public.trucks TO anon;
GRANT SELECT ON public.drivers TO anon;
GRANT SELECT ON public.trailers TO anon;

DROP POLICY IF EXISTS "Anon can view trucks" ON public.trucks;
CREATE POLICY "Anon can view trucks" ON public.trucks FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "Anon can view drivers" ON public.drivers;
CREATE POLICY "Anon can view drivers" ON public.drivers FOR SELECT TO anon USING (true);

DROP POLICY IF EXISTS "Anon can view trailers" ON public.trailers;
CREATE POLICY "Anon can view trailers" ON public.trailers FOR SELECT TO anon USING (true);
