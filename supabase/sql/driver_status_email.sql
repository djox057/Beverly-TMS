-- Staged rollout: live notifications are OFF until the four test messages are reviewed.
create schema if not exists driver_status_private;
revoke all on schema driver_status_private from public, anon, authenticated;

create table public.driver_status_email_settings (
  id boolean primary key default true check (id),
  enabled boolean not null default false
);
insert into public.driver_status_email_settings(id,enabled) values(true,false);
alter table public.driver_status_email_settings enable row level security;
revoke all on public.driver_status_email_settings from public,anon,authenticated;
grant all on public.driver_status_email_settings to service_role;

create table public.driver_status_emails (
  id uuid primary key default gen_random_uuid(),
  driver_id uuid not null,
  action text not null check(action in ('two_week_notice','two_week_cancelled','two_week_updated','done','continued_driving')),
  occurred_at timestamptz not null default now(),
  driver_snapshot jsonb not null,
  old_notice_date date,
  new_notice_date date,
  actor_name text,
  is_test boolean not null default false,
  attempts integer not null default 0,
  next_attempt_at timestamptz not null default now(),
  claim_token uuid,
  claimed_at timestamptz,
  email_payload jsonb,
  sent_at timestamptz,
  provider_message_id text,
  last_error text
);
alter table public.driver_status_emails enable row level security;
revoke all on public.driver_status_emails from public,anon,authenticated;
grant all on public.driver_status_emails to service_role;
create index driver_status_emails_pending on public.driver_status_emails(next_attempt_at) where sent_at is null and attempts<5;

create function driver_status_private.status_action(old_active boolean,new_active boolean,old_notice date,new_notice date)
returns text language sql immutable set search_path='' as $$
  select case
    when old_active is true and new_active is false then 'done'
    when old_active is false and new_active is true then 'continued_driving'
    when old_notice is null and new_notice is not null then 'two_week_notice'
    when old_notice is not null and new_notice is null then 'two_week_cancelled'
    when old_notice is distinct from new_notice then 'two_week_updated'
    else null end;
$$;
revoke all on function driver_status_private.status_action(boolean,boolean,date,date) from public,anon,authenticated;

-- Internal trigger only. SECURITY DEFINER is needed to enqueue after an existing
-- RLS-authorized driver update; this function cannot be invoked through the API.
create function driver_status_private.enqueue()
returns trigger language plpgsql security definer set search_path='' as $$
declare action_name text; company_name text;
begin
  if not exists(select 1 from public.driver_status_email_settings where enabled) then return new; end if;
  action_name := driver_status_private.status_action(old.is_active,new.is_active,old.two_week_block_date,new.two_week_block_date);
  if action_name is null then return new; end if;
  select c.name into company_name from public.companies c where c.id=new.company_id;
  insert into public.driver_status_emails(driver_id,action,driver_snapshot,old_notice_date,new_notice_date)
  values(new.id,action_name,jsonb_build_object('name',new.name,'first_name',new.first_name,'last_name',new.last_name,'hire_date',new.hire_date,'termination_date',new.termination_date,'company',company_name,'phone',new.phone,'email',new.email,'home_city',new.home_city,'home_state',new.home_state),old.two_week_block_date,new.two_week_block_date);
  return new;
end;
$$;
revoke all on function driver_status_private.enqueue() from public,anon,authenticated;
create trigger queue_driver_status_email after update of is_active,two_week_block_date on public.drivers
for each row when (old.is_active is distinct from new.is_active or old.two_week_block_date is distinct from new.two_week_block_date)
execute function driver_status_private.enqueue();

-- Service-only atomic leases prevent concurrent workers from sending the same event.
create function public.claim_driver_status_email(p_event_id uuid default null)
returns setof public.driver_status_emails language sql security invoker set search_path='' as $$
  update public.driver_status_emails e
  set claim_token=gen_random_uuid(),claimed_at=now(),attempts=attempts+1
  where e.id=(select q.id from public.driver_status_emails q
    where q.sent_at is null and q.attempts<5 and q.occurred_at>now()-interval '23 hours'
      and q.next_attempt_at<=now() and (q.claimed_at is null or q.claimed_at<now()-interval '5 minutes')
      and ((p_event_id is not null and q.id=p_event_id and q.is_test)
        or (p_event_id is null and not q.is_test and exists(select 1 from public.driver_status_email_settings where enabled)))
    order by q.occurred_at for update skip locked limit 1)
  returning e.*;
$$;
revoke all on function public.claim_driver_status_email(uuid) from public,anon,authenticated;
grant execute on function public.claim_driver_status_email(uuid) to service_role;

-- Same Vault CRON_SECRET pattern used by the existing low-drive reminders.
create function driver_status_private.wake_worker()
returns void language plpgsql security definer set search_path='' as $$
declare secret text;
begin
  if not exists(select 1 from public.driver_status_email_settings where enabled) then return; end if;
  if not exists(select 1 from public.driver_status_emails where not is_test and sent_at is null and attempts<5 and next_attempt_at<=now() and occurred_at>now()-interval '23 hours') then return; end if;
  select decrypted_secret into secret from vault.decrypted_secrets where name='CRON_SECRET';
  if secret is null then raise warning 'Driver status email CRON_SECRET is missing'; return; end if;
  perform net.http_post(url:='https://wjkbtagwgjniilmgwutb.supabase.co/functions/v1/send-driver-status-email',headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||secret),body:='{}'::jsonb,timeout_milliseconds:=10000);
end;
$$;
revoke all on function driver_status_private.wake_worker() from public,anon,authenticated;
select cron.schedule('driver-status-emails','* * * * *','select driver_status_private.wake_worker()');

-- Enable after test review: UPDATE public.driver_status_email_settings SET enabled=true WHERE id;
-- Kill switch: UPDATE public.driver_status_email_settings SET enabled=false WHERE id;
