-- Keep the workbook register separate from the existing roadside check workflow.
create table public.roadside_records (
  id uuid primary key default gen_random_uuid(),
  sheet text not null check (sheet in ('ALL', 'Lawyers')),
  source_row integer check (source_row > 1),
  fields jsonb not null check (jsonb_typeof(fields) = 'object' and fields <> '{}'::jsonb),
  links jsonb not null default '{}' check (jsonb_typeof(links) = 'object'),
  notes jsonb not null default '{}' check (jsonb_typeof(notes) = 'object'),
  highlights jsonb not null default '{}' check (jsonb_typeof(highlights) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (sheet, source_row)
);

create trigger roadside_records_updated_at before update on public.roadside_records
for each row execute function public.update_updated_at_column();

alter table public.roadside_records enable row level security;
revoke all on public.roadside_records from public, anon, authenticated;
grant select, insert (id, sheet, fields, links, highlights), update (fields, links, highlights)
  on public.roadside_records to authenticated;

create policy roadside_records_read on public.roadside_records for select to authenticated
using ((select public.has_any_role(array['admin','safety','maintenance','manager','chicago_management']::public.app_role[])));
create policy roadside_records_add on public.roadside_records for insert to authenticated
with check ((select public.has_any_role(array['admin','safety','maintenance']::public.app_role[])));
create policy roadside_records_edit on public.roadside_records for update to authenticated
using ((select public.has_any_role(array['admin','safety','maintenance']::public.app_role[])))
with check ((select public.has_any_role(array['admin','safety','maintenance']::public.app_role[])));
