-- Add only maintenance storage reads.
CREATE POLICY "Maintenance can view order files in storage"
ON storage.objects FOR SELECT TO authenticated
USING (bucket_id = 'order-files' AND (SELECT public.has_role((SELECT auth.uid()), 'maintenance'::public.app_role)));

-- Preserve each existing policy expression and all other roles verbatim.
-- Only remove maintenance from the three existing file-write role arrays.
DO $$
DECLARE p record; new_using text; new_check text;
BEGIN
  FOR p IN SELECT policyname, cmd, qual, with_check FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'order_files'
      AND policyname IN ('Roles can create order_files', 'Roles can update order_files', 'Roles can delete order_files')
  LOOP
    new_using := replace(p.qual, ', ''maintenance''::app_role', '');
    new_check := replace(p.with_check, ', ''maintenance''::app_role', '');
    IF p.cmd = 'INSERT' THEN
      EXECUTE format('ALTER POLICY %I ON public.order_files WITH CHECK (%s)', p.policyname, new_check);
    ELSIF p.cmd = 'UPDATE' THEN
      EXECUTE format('ALTER POLICY %I ON public.order_files USING (%s) WITH CHECK (%s)', p.policyname, new_using, coalesce(new_check, new_using));
    ELSE
      EXECUTE format('ALTER POLICY %I ON public.order_files USING (%s)', p.policyname, new_using);
    END IF;
  END LOOP;
END;
$$;
