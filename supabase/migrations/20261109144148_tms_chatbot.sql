-- Chatbot access is deliberately separate from self-editable profiles.
create table public.chatbot_access (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default false
);
alter table public.chatbot_access enable row level security;
grant select, insert, update, delete on public.chatbot_access to authenticated;
grant all on public.chatbot_access to service_role;
create policy "Read own chatbot access" on public.chatbot_access for select to authenticated
  using (user_id = (select auth.uid()));
create policy "Admins manage chatbot access" on public.chatbot_access for all to authenticated
  using ((select public.has_role(auth.uid(), 'admin'::public.app_role)))
  with check ((select public.has_role(auth.uid(), 'admin'::public.app_role)));

create table public.chatbot_faq (
  id uuid primary key default gen_random_uuid(),
  question text not null check (length(question) between 1 and 200),
  answer text not null check (length(answer) between 1 and 2000),
  answer_sr text not null default '' check (length(answer_sr) <= 2000),
  keywords text[] not null default '{}',
  page_path text not null default '/info' check (page_path ~ '^/[^/]' and length(page_path) <= 200),
  published boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.chatbot_faq enable row level security;
grant select, insert, update, delete on public.chatbot_faq to authenticated;
grant all on public.chatbot_faq to service_role;
create policy "Chatbot users read published FAQ" on public.chatbot_faq for select to authenticated
  using (published and exists (select 1 from public.chatbot_access a where a.user_id = (select auth.uid()) and a.enabled));
create policy "Admins manage chatbot FAQ" on public.chatbot_faq for all to authenticated
  using ((select public.has_role(auth.uid(), 'admin'::public.app_role)))
  with check ((select public.has_role(auth.uid(), 'admin'::public.app_role)));
insert into public.chatbot_faq(question,answer,answer_sr,keywords,page_path) values
  ('What is the yard address?', '3301 Wireton Rd, Blue Island, IL 60406', '3301 Wireton Rd, Blue Island, IL 60406', array['yard','address','jard','adresa','blue island'], '/info');

-- Explicit review supports other document types without exposing generic scans by default.
create table public.chatbot_document_reviews (
  kind text not null check (kind in ('driver','truck','trailer','order','company')),
  file_id uuid not null,
  allowed boolean not null,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz not null default now(),
  primary key(kind,file_id)
);
create index chatbot_document_reviews_reviewer_idx on public.chatbot_document_reviews(reviewed_by);
alter table public.chatbot_document_reviews enable row level security;
grant select, insert, update, delete on public.chatbot_document_reviews to authenticated;
grant all on public.chatbot_document_reviews to service_role;
create policy "Admins review chatbot documents" on public.chatbot_document_reviews for all to authenticated
  using ((select public.has_role(auth.uid(), 'admin'::public.app_role)))
  with check ((select public.has_role(auth.uid(), 'admin'::public.app_role)));

-- Stores counters only, never messages, answers, or record identifiers.
create table public.chatbot_request_limits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  minute_start timestamptz not null,
  minute_hits integer not null,
  day_start date not null,
  day_hits integer not null
);
alter table public.chatbot_request_limits enable row level security;
create policy "Service role manages chatbot counters" on public.chatbot_request_limits for all to service_role using (true) with check (true);
revoke all on public.chatbot_request_limits from public, anon, authenticated;
grant all on public.chatbot_request_limits to service_role;
create function public.chatbot_consume_request(p_user_id uuid) returns boolean
language sql security invoker set search_path = '' as $$
  with consumed as (
    insert into public.chatbot_request_limits(user_id,minute_start,minute_hits,day_start,day_hits)
    values(p_user_id, date_trunc('minute',now()),1,(now() at time zone 'UTC')::date,1)
    on conflict (user_id) do update set
      minute_start = date_trunc('minute',now()),
      minute_hits = case when chatbot_request_limits.minute_start = date_trunc('minute',now()) then chatbot_request_limits.minute_hits + 1 else 1 end,
      day_start = (now() at time zone 'UTC')::date,
      day_hits = case when chatbot_request_limits.day_start = (now() at time zone 'UTC')::date then chatbot_request_limits.day_hits + 1 else 1 end
    where (chatbot_request_limits.minute_start < date_trunc('minute',now()) or chatbot_request_limits.minute_hits < 30)
      and (chatbot_request_limits.day_start < (now() at time zone 'UTC')::date or chatbot_request_limits.day_hits < 400)
    returning 1
  ) select exists(select 1 from consumed);
$$;
revoke all on function public.chatbot_consume_request(uuid) from public,anon,authenticated;
grant execute on function public.chatbot_consume_request(uuid) to service_role;
