-- Match ProtectedRoute's primary-role precedence for users with multiple roles.
alter policy roadside_records_read on public.roadside_records
  using ((select upcoming_drivers_private.primary_role()) in ('admin', 'maintenance', 'manager'));

alter policy roadside_records_add on public.roadside_records
  with check ((select upcoming_drivers_private.primary_role()) in ('admin', 'maintenance'));

alter policy roadside_records_edit on public.roadside_records
  using ((select upcoming_drivers_private.primary_role()) in ('admin', 'maintenance'))
  with check ((select upcoming_drivers_private.primary_role()) in ('admin', 'maintenance'));
