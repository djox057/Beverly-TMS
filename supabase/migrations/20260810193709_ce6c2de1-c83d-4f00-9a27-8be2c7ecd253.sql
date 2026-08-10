DROP POLICY IF EXISTS "Admin, managers, and accounting can view salary payments" ON public.dispatcher_salary_payments;
DROP POLICY IF EXISTS "Admin, managers, and accounting can insert salary payments" ON public.dispatcher_salary_payments;
DROP POLICY IF EXISTS "Admin, managers, and accounting can update salary payments" ON public.dispatcher_salary_payments;
DROP POLICY IF EXISTS "Admin, managers, and accounting can delete salary payments" ON public.dispatcher_salary_payments;

CREATE POLICY "Admin, managers, and accounting can view salary payments"
ON public.dispatcher_salary_payments FOR SELECT TO authenticated
USING (public.has_any_role(ARRAY['admin','manager','accounting','supervisor','chicago_management']::public.app_role[]));

CREATE POLICY "Admin, managers, and accounting can insert salary payments"
ON public.dispatcher_salary_payments FOR INSERT TO authenticated
WITH CHECK (public.has_any_role(ARRAY['admin','manager','accounting','supervisor','chicago_management']::public.app_role[]));

CREATE POLICY "Admin, managers, and accounting can update salary payments"
ON public.dispatcher_salary_payments FOR UPDATE TO authenticated
USING (public.has_any_role(ARRAY['admin','manager','accounting','supervisor','chicago_management']::public.app_role[]))
WITH CHECK (public.has_any_role(ARRAY['admin','manager','accounting','supervisor','chicago_management']::public.app_role[]));

CREATE POLICY "Admin, managers, and accounting can delete salary payments"
ON public.dispatcher_salary_payments FOR DELETE TO authenticated
USING (public.has_any_role(ARRAY['admin','manager','accounting','supervisor','chicago_management']::public.app_role[]));