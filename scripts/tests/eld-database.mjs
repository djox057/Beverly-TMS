// Isolated PostgreSQL validation. Install @electric-sql/pglite outside the repo,
// then run: ELD_PGLITE_MODULE=/absolute/path/to/pglite/dist/index.js node scripts/tests/eld-database.mjs
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const { PGlite } = await import(process.env.ELD_PGLITE_MODULE || '@electric-sql/pglite');
const db = new PGlite();
const ids = Object.fromEntries(['admin','worker','other','manager','ordinary','dispatch','d1','d2','inactive'].map((key, i) => [key, `00000000-0000-4000-8000-${String(i + 1).padStart(12, '0')}`]));
await db.exec(`
  create role anon; create role authenticated; create role service_role; create role supabase_admin;
  create schema auth; grant usage on schema auth to public;
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
  create type public.app_role as enum ('admin','maintenance','dispatch');
  create table public.profiles(user_id uuid primary key, full_name text, email text, is_eld boolean not null default false);
  create table public.user_roles(user_id uuid references public.profiles, role public.app_role);
  create table public.drivers(id uuid primary key, name text, first_name text, last_name text, is_active boolean);
  create table public.trucks(id uuid primary key default gen_random_uuid(), truck_number text, is_active boolean, driver1_id uuid, driver2_id uuid);
  create function public.has_role(_user_id uuid,_role public.app_role) returns boolean language sql stable security definer set search_path = public as $$ select exists(select 1 from public.user_roles where user_id=_user_id and role=_role) $$;
  -- Cron's SQL scheduler is the only extension stub; all tables, functions, grants,
  -- RLS, triggers and application RPCs execute unchanged in real PostgreSQL.
  create schema cron; create function cron.schedule(text,text,text) returns bigint language sql as $$ select 1::bigint $$;
  grant select,update,insert on public.profiles to authenticated;
  insert into public.profiles(user_id,full_name,email,is_eld) values
    ('${ids.admin}','Admin','admin@test.local',false),('${ids.worker}','Worker','worker@test.local',true),
    ('${ids.other}','Other','other@test.local',true),('${ids.manager}','Manager','manager@test.local',false),
    ('${ids.ordinary}','Ordinary','ordinary@test.local',false),('${ids.dispatch}','Dispatch','dispatch@test.local',false);
  insert into public.user_roles values ('${ids.admin}','admin'),('${ids.worker}','maintenance'),('${ids.other}','maintenance'),('${ids.manager}','maintenance'),('${ids.ordinary}','maintenance'),('${ids.dispatch}','dispatch');
  insert into public.drivers values ('${ids.d1}','Driver One',null,null,true),('${ids.d2}','Driver Two',null,null,true),('${ids.inactive}','Inactive',null,null,false);
  insert into public.trucks(truck_number,is_active,driver1_id,driver2_id) values ('460',true,'${ids.d1}','${ids.d2}');
`);
await db.exec(await readFile(new URL('../../supabase/migrations/20261021132641_eld_daily_monitoring.sql', import.meta.url),'utf8'));
await db.exec(await readFile(new URL('../../supabase/migrations/20261021132947_eld_history_references.sql', import.meta.url),'utf8'));
const today = (await db.query(`select (now() at time zone 'America/Chicago')::date::text as date`)).rows[0].date;
assert.ok((await db.query(`select extract(isodow from date '${today}') as day`)).rows[0].day <= 5, 'Run on a weekday to exercise daily roster creation');
await db.exec(`update public.profiles set is_eld_manager=true where user_id='${ids.manager}'`);
const as = async key => { await db.exec('reset role'); await db.query(`select set_config('request.jwt.claim.sub',$1,false)`,[ids[key] || '']); await db.exec('set role authenticated'); };
const rpc = async (name,args=[]) => {
  const params = name === 'eld_save_check' ? args.map((v,i) => i===2 ? JSON.stringify(v) : v) : args;
  return (await db.query(`select public.${name}(${args.map((_,i)=>`$${i+1}`).join(',')}) as result`,params)).rows[0].result;
};
const denied = async fn => { await assert.rejects(fn); };
await as('admin');
let day = await rpc('eld_get_day',[today]);
assert.equal(day.checks.length,2); assert.equal(day.can_manage,true); assert.ok(day.checks.every(c=>c.truck_number==='460'));
const own = day.checks.find(c=>c.driver_id===ids.d1), other = day.checks.find(c=>c.driver_id===ids.d2);
await rpc('eld_manage',['assign',{driver_id:ids.d1,worker_id:ids.worker}]);
await rpc('eld_manage',['assign',{driver_id:ids.d2,worker_id:ids.other}]);
await denied(()=>rpc('eld_manage',['assign',{driver_id:ids.inactive,worker_id:ids.worker}]));
await denied(()=>rpc('eld_manage',['assign',{driver_id:ids.d1,worker_id:ids.ordinary}]));
await as('worker'); day=await rpc('eld_get_day',[today]);
assert.equal(day.checks.length,1); assert.equal(day.checks[0].driver_id,ids.d1); assert.equal(day.can_manage,false);
assert.equal((await db.query('select * from public.eld_daily_checks')).rows.length,1);
assert.equal((await db.query('select * from public.eld_assignments')).rows.length,1);
await rpc('eld_save_check',[own.id,'yesterday_log',true]);
await rpc('eld_save_check',[own.id,'forms',true]);
await rpc('eld_save_check',[own.id,'comment','Documents reviewed']);
await denied(()=>rpc('eld_save_check',[other.id,'pti',true]));
await denied(()=>rpc('eld_save_check',[own.id,'worker_id',ids.other]));
await denied(()=>rpc('eld_save_check',[own.id,'pti','not a boolean']));
await denied(()=>rpc('eld_manage',['assign',{driver_id:ids.d1,worker_id:ids.other}]));
await denied(()=>db.exec(`update public.eld_daily_checks set pti=true where id='${own.id}'`));
await denied(()=>db.exec(`update public.profiles set is_eld_manager=true where user_id='${ids.worker}'`));
await denied(()=>db.exec(`insert into public.profiles(user_id,email,is_eld,is_eld_manager) values(gen_random_uuid(),'spoof@test.local',true,true)`));
await denied(()=>db.exec(`select eld_private.sync_today()`));
day=await rpc('eld_get_day',[today]); assert.equal(day.checks[0].yesterday_log,true); assert.equal(day.checks[0].forms,true); assert.equal(day.checks[0].pti,false); assert.equal(day.checks[0].comment,'Documents reviewed');
await as('ordinary'); day=await rpc('eld_get_day',[today]); assert.equal(day.checks.length,0); assert.equal(day.can_work,false);
await as('dispatch'); await denied(()=>rpc('eld_get_day',[today]));
await as('manager'); day=await rpc('eld_get_day',[today]); assert.equal(day.checks.length,2); assert.equal(day.can_manage,true);
await rpc('eld_manage',['add_task',{work_date:today,worker_id:ids.worker,description:'Check connection'}]);
await as('worker'); day=await rpc('eld_get_day',[today]); const task=day.tasks[0]; assert.equal(task.description,'Check connection');
await rpc('eld_manage',['complete_task',{id:task.id,completed:true}]);
await as('other'); assert.equal((await rpc('eld_get_day',[today])).tasks.length,0);
await denied(()=>rpc('eld_manage',['complete_task',{id:task.id,completed:false}]));
await as('manager'); day=await rpc('eld_get_day',[today]); assert.equal(day.tasks[0].completed_by,ids.worker); assert.ok(day.tasks[0].completed_at);
await rpc('eld_manage',['complete_task',{id:task.id,completed:false}]);
assert.equal((await rpc('eld_get_day',[today])).tasks[0].completed_at,null);
// Build a past snapshot; current roster reconciliation must preserve its identity and work.
await db.exec('reset role');
await db.exec(`insert into public.eld_daily_checks(work_date,driver_id,driver_name,truck_number,worker_id,worker_name,yesterday_log,forms,pti,comment)
  values((select max(d::date) from generate_series(date '${today}'-interval '4 days',date '${today}'-interval '1 day',interval '1 day') d where extract(isodow from d)<6),'${ids.d1}','Historical Driver','OLD','${ids.worker}','Worker',true,true,true,'Historical comment');`);
const history=(await db.query(`select * from public.eld_daily_checks where work_date<date '${today}'`)).rows[0];
await db.exec(`update public.eld_daily_checks set yesterday_log=false,forms=false,pti=false,comment='' where work_date=date '${today}'; select eld_private.sync_today();`);
const historicalAfter=(await db.query(`select * from public.eld_daily_checks where id='${history.id}'`)).rows[0];
assert.deepEqual(historicalAfter,history);
await as('worker'); await denied(()=>rpc('eld_save_check',[history.id,'pti',false]));
await as('manager'); await rpc('eld_save_check',[history.id,'pti',false]);
await rpc('eld_manage',['assign',{driver_id:ids.d1,worker_id:ids.other}]);
await as('worker'); assert.equal((await rpc('eld_get_day',[today])).checks.length,0);
assert.equal((await rpc('eld_get_day',[history.work_date.toISOString().slice(0,10)])).checks.length,1);
await denied(()=>rpc('eld_save_check',[own.id,'pti',true]));
await as('other'); assert.equal((await rpc('eld_get_day',[today])).checks.length,2);
await db.exec('reset role'); await db.exec(`update public.drivers set is_active=false where id='${ids.d1}'`);
await as('manager'); assert.equal((await rpc('eld_get_day',[today])).checks.length,1);
await denied(()=>rpc('eld_save_check',[own.id,'pti',true]));
await db.exec('reset role');
assert.equal((await db.query(`select count(*)::int as count from public.eld_activity where entity_type='check' and actor_id='${ids.worker}'`)).rows[0].count,3);
await db.exec(`set role anon`); await denied(()=>rpc('eld_get_day',[today])); await denied(()=>db.exec('select * from public.eld_daily_checks'));
// Deleting live entities must not remove historical work or block existing deletion flows.
await db.exec('reset role');
await db.exec(`delete from public.drivers where id='${ids.d1}'`);
assert.equal((await db.query(`select count(*)::int as count from public.eld_daily_checks where driver_id='${ids.d1}'`)).rows[0].count,2);
await db.exec(`delete from public.user_roles where user_id in ('${ids.other}','${ids.worker}','${ids.admin}','${ids.manager}'); delete from public.profiles where user_id in ('${ids.other}','${ids.worker}','${ids.admin}','${ids.manager}')`);
assert.equal((await db.query(`select worker_id from public.eld_assignments where driver_id='${ids.d2}'`)).rows[0].worker_id,null);
assert.equal((await db.query('select count(*)::int as count from public.eld_side_tasks')).rows[0].count,1);
assert.ok((await db.query('select count(*)::int as count from public.eld_activity')).rows[0].count>0);
console.log('Passed: roster/team drivers, assignments, worker isolation/RLS, protected ELD tags, checklist fields, audit, side tasks, history, reassignment, deactivation, anonymous denial, driver/account deletion without loss of history.');
await db.close();
