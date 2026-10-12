create table public.pod_rejections (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null,
  order_id uuid not null references public.orders(id) on delete cascade,
  reporter_id uuid references auth.users(id) on delete set null,
  reporter_name text not null,
  reporter_email text not null,
  broker_load_number text,
  booked_by_company_id uuid references public.companies(id) on delete set null,
  reason text not null check (length(trim(reason)) between 1 and 5000),
  pods jsonb not null check (jsonb_typeof(pods) = 'array' and jsonb_array_length(pods) between 1 and 20),
  notification_status text not null default 'pending' check (notification_status in ('pending', 'sent', 'failed')),
  email_id text,
  created_at timestamptz not null default now(),
  notified_at timestamptz,
  unique (reporter_id, order_id, request_id)
);
create index pod_rejections_order_idx on public.pod_rejections(order_id);
create index pod_rejections_company_created_idx on public.pod_rejections(booked_by_company_id, created_at desc, id desc);
create index pod_rejections_created_idx on public.pod_rejections(created_at desc, id desc);
alter table public.pod_rejections enable row level security;
revoke all on public.pod_rejections from anon, authenticated;
grant select on public.pod_rejections to authenticated;
grant select, insert, update on public.pod_rejections to service_role;
create policy "Accounting managers and admins can read accessible POD rejections"
  on public.pod_rejections for select to authenticated
  using (
    (select public.has_any_role(array['accounting'::public.app_role, 'manager'::public.app_role, 'admin'::public.app_role]))
    and exists (select 1 from public.orders o where o.id = pod_rejections.order_id)
  );
comment on table public.pod_rejections is 'Immutable rejection reports written by the protected POD email endpoint; notification state tracks email acceptance.';
