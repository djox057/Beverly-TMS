CREATE POLICY "Allow anon select" ON public.drivers FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon select" ON public.trucks FOR SELECT TO anon USING (true);
CREATE POLICY "Allow anon select" ON public.trailers FOR SELECT TO anon USING (true);