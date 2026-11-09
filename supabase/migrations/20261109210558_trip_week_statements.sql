-- Separate from paid status: attaching a statement does not mark loads/fuel paid.
create table public.trip_week_statements (
  id uuid primary key default gen_random_uuid(),
  truck_number text not null check (length(truck_number) > 0),
  driver_name text not null check (length(driver_name) > 0),
  week_start text not null check (week_start ~ '^\d{4}-\d{2}-\d{2}$'),
  paid_amount numeric(12,2) not null check (paid_amount between -9999999999.99 and 9999999999.99),
  file_name text not null check (file_name ~* '\.(pdf|xlsx)$'),
  file_path text not null unique check (file_path ~* '^[0-9a-f-]{36}\.(pdf|xlsx)$'),
  unique (truck_number, driver_name, week_start)
);
alter table public.trip_week_statements enable row level security;
grant select, insert, update on public.trip_week_statements to authenticated;
revoke all on public.trip_week_statements from anon;

create policy "Statement readers" on public.trip_week_statements for select to authenticated
  using ((select public.has_any_role(array['admin','accounting','manager']::public.app_role[])));
create policy "Statement uploads" on public.trip_week_statements for insert to authenticated
  with check ((select public.has_any_role(array['admin','accounting']::public.app_role[])));
create policy "Statement replacements" on public.trip_week_statements for update to authenticated
  using ((select public.has_any_role(array['admin','accounting']::public.app_role[])))
  with check ((select public.has_any_role(array['admin','accounting']::public.app_role[])));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('trip-statements', 'trip-statements', false, 20971520,
  array['application/pdf','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']);
create policy "Read trip statements" on storage.objects for select to authenticated
  using (bucket_id = 'trip-statements' and (select public.has_any_role(array['admin','accounting','manager']::public.app_role[])));
create policy "Upload trip statements" on storage.objects for insert to authenticated
  with check (bucket_id = 'trip-statements' and (select public.has_any_role(array['admin','accounting']::public.app_role[])));
-- Unique file names avoid in-place replacement and cached previews of a different statement.
create policy "Delete replaced trip statements" on storage.objects for delete to authenticated
  using (bucket_id = 'trip-statements' and (select public.has_any_role(array['admin','accounting']::public.app_role[])));
