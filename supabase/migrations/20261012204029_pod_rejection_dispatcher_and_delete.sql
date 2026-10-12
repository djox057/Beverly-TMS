alter table public.pod_rejections
  add column dispatcher_name text,
  add column deleted_at timestamptz,
  add column deleted_by uuid references auth.users(id) on delete set null;

-- Snapshot the booking dispatcher's name for reports already created.
update public.pod_rejections r
set dispatcher_name = coalesce(
  (select p.full_name from public.profiles p where p.user_id::text = o.booked_by),
  case when o.booked_by !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then nullif(o.booked_by, '') end
)
from public.orders o where o.id = r.order_id;

create index pod_rejections_deleted_by_idx on public.pod_rejections(deleted_by) where deleted_by is not null;
drop index public.pod_rejections_created_idx;
create index pod_rejections_created_idx on public.pod_rejections(created_at desc, id desc) where deleted_at is null;
drop index public.pod_rejections_company_created_idx;
create index pod_rejections_company_created_idx on public.pod_rejections(booked_by_company_id, created_at desc, id desc) where deleted_at is null;

drop policy "Accounting managers and admins can read accessible POD rejections" on public.pod_rejections;
create policy "Accounting managers and admins can read accessible POD rejections"
  on public.pod_rejections for select to authenticated
  using (
    deleted_at is null
    and (select public.has_any_role(array['accounting'::public.app_role, 'manager'::public.app_role, 'admin'::public.app_role]))
    and exists (select 1 from public.orders o where o.id = pod_rejections.order_id)
  );
comment on table public.pod_rejections is 'Server-validated rejection reports; deleted reports retain request IDs to prevent retries recreating them.';
