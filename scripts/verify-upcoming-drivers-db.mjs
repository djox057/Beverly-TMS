import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const {PGlite}=await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const db=new PGlite();
const roles=['admin','manager','supervisor','safety','recruiting','chicago_management','dispatch','accounting','claims','maintenance','afterhours','yard','driver'];
const uid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const users=Object.fromEntries(roles.map((r,i)=>[r,uid(i+1)]));
await db.exec(`
 CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role;
 CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
 CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$ SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
 GRANT USAGE ON SCHEMA auth TO authenticated;
 CREATE TYPE public.app_role AS ENUM (${roles.map(r=>`'${r}'`).join(',')});
 CREATE TABLE public.user_roles(user_id uuid REFERENCES auth.users ON DELETE CASCADE,role app_role);
 ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
 GRANT SELECT ON public.user_roles TO authenticated;
 CREATE POLICY own_roles ON public.user_roles FOR SELECT TO authenticated USING(user_id=auth.uid());
 CREATE TABLE public.profiles(user_id uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,full_name text);
 CREATE TABLE public.trucks(id uuid PRIMARY KEY,truck_number text,driver_id uuid);
 CREATE TABLE public.drivers(id uuid PRIMARY KEY);
 CREATE SCHEMA realtime;
 CREATE TABLE realtime.messages(id uuid DEFAULT gen_random_uuid(),topic text,payload jsonb,event text,private boolean);
 ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;
 GRANT USAGE ON SCHEMA realtime TO authenticated;
 GRANT SELECT,INSERT ON realtime.messages TO authenticated;
 CREATE POLICY broad_read ON realtime.messages FOR SELECT TO authenticated USING(true);
 CREATE POLICY broad_write ON realtime.messages FOR INSERT TO authenticated WITH CHECK(true);
 CREATE FUNCTION realtime.send(payload jsonb,event text,topic text,private boolean DEFAULT true) RETURNS void LANGUAGE sql AS $$
   INSERT INTO realtime.messages(payload,event,topic,private) VALUES(payload,event,topic,private);
 $$;
`);
for(const [role,id]of Object.entries(users)){
 await db.query('insert into auth.users values($1)',[id]);
 await db.query('insert into public.user_roles values($1,$2)',[id,role]);
 await db.query('insert into public.profiles values($1,$2)',[id,`${role} fixture`]);
}
await db.query('insert into auth.users values($1)',[uid(99)]);
await db.query('insert into public.trucks values($1,$2,null)',[uid(100),'TEST-100']);
const migration=new URL('../supabase/migrations/20260915191425_upcoming_drivers_board.sql',import.meta.url);
await db.exec(await fs.readFile(migration,'utf8'));
const cleanupMigration=new URL('../supabase/migrations/20260915192105_upcoming_drivers_reference_history.sql',import.meta.url);
await db.exec(await fs.readFile(cleanupMigration,'utf8'));
let checks=0;
async function asUser(id,sql,params=[]){
 await db.exec('begin; set local role authenticated;');
 try{
  await db.query("select set_config('request.jwt.claim.sub',$1,true)",[id]);
  const result=await db.query(sql,params);await db.exec('commit');return result;
 }catch(e){await db.exec('rollback');throw e;}
}
const writeRoles=['admin','manager','supervisor','safety','recruiting','dispatch'];
const readRoles=[...writeRoles,'chicago_management'];
const id=uid(200);
await asUser(users.admin,`insert into public.upcoming_drivers(id,driver_name,phone,arrival_date,arrival_time,description,truck_id)
 values($1,'Candidate fixture','312-555-0123','2026-11-01','01:30','Full comment',$2)`,[id,uid(100)]);
for(const role of [...roles,'none']){
 const user=users[role] || uid(99);
 const read=await asUser(user,'select id from public.upcoming_drivers');
 assert.equal(read.rows.length>0,readRoles.includes(role),`${role} read`);checks++;
 const update=await asUser(user,"update public.upcoming_drivers set sales='edited' where id=$1 returning id",[id]);
 assert.equal(update.rows.length===1,writeRoles.includes(role),`${role} update`);checks++;
 const history=await asUser(user,'select id from public.upcoming_driver_history');
 assert.equal(history.rows.length>0,readRoles.includes(role),`${role} history`);checks++;
 if(!readRoles.includes(role)) await assert.rejects(asUser(user,'select * from public.upcoming_driver_staff()'));
 else assert.equal((await asUser(user,'select * from public.upcoming_driver_staff()')).rows.length,3);
 checks++;
 const messages=await asUser(user,"select * from realtime.messages where topic='upcoming-drivers'");
 assert.equal(messages.rows.length>0,readRoles.includes(role),`${role} broadcast`);checks++;
 await assert.rejects(asUser(user,"insert into realtime.messages(topic) values('upcoming-drivers')"));checks++;
}
for(const role of roles){
 const create=()=>asUser(users[role],"insert into public.upcoming_drivers(driver_name,phone) values('New fixture','3125550124') returning id");
 if(writeRoles.includes(role))assert.equal((await create()).rows.length,1);else await assert.rejects(create());
 checks++;
}
// Existing unrelated realtime topics remain accessible.
await asUser(users.accounting,"insert into realtime.messages(topic) values('unrelated-topic')");
assert.equal((await asUser(users.accounting,"select * from realtime.messages where topic='unrelated-topic'")).rows.length,1);checks++;
// Mixed real roles must match the frontend's primary-role precedence.
await db.query("insert into public.user_roles values($1,'accounting'),($2,'accounting'),($3,'dispatch')",[users.manager,users.safety,users.claims]);
assert.equal((await asUser(users.manager,'select id from public.upcoming_drivers')).rows.length,0);checks++;
assert.ok((await asUser(users.safety,'select id from public.upcoming_drivers')).rows.length>0);checks++;
assert.equal((await asUser(users.claims,'select id from public.upcoming_drivers')).rows.length,0);checks++;
await db.query("delete from public.user_roles where user_id=$1 and role='accounting'",[users.manager]);
// Archive/restore permissions are enforced at the database, not only by buttons.
for(const role of writeRoles){
 if(['admin','manager','supervisor'].includes(role)){
  await asUser(users[role],'update public.upcoming_drivers set archived=true where id=$1',[id]);
  await asUser(users[role],'update public.upcoming_drivers set archived=false where id=$1',[id]);
 }else await assert.rejects(asUser(users[role],'update public.upcoming_drivers set archived=true where id=$1',[id]));
 checks++;
}
await assert.rejects(asUser(users.admin,'delete from public.upcoming_drivers where id=$1',[id]));checks++;
await assert.rejects(asUser(users.admin,'update public.upcoming_drivers set version=999 where id=$1',[id]));checks++;
await assert.rejects(asUser(users.admin,'insert into public.upcoming_driver_history(upcoming_driver_id,operation,changes) values($1,\'UPDATE\',\'{}\')',[id]));checks++;
await assert.rejects(asUser(users.admin,'update public.upcoming_drivers set recruiter_id=$1 where id=$2',[users.manager,id]));checks++;
await asUser(users.dispatch,'update public.upcoming_drivers set recruiter_id=$1,safety_id=$2,dispatcher_id=$3 where id=$4',[users.recruiting,users.safety,users.dispatch,id]);checks++;
// Optimistic concurrency: the second writer cannot replace the first edit.
const version=(await asUser(users.admin,'select version from public.upcoming_drivers where id=$1',[id])).rows[0].version;
assert.equal((await asUser(users.admin,"update public.upcoming_drivers set description='Writer one' where id=$1 and version=$2 returning version",[id,version])).rows.length,1);checks++;
assert.equal((await asUser(users.safety,"update public.upcoming_drivers set description='Writer two' where id=$1 and version=$2 returning version",[id,version])).rows.length,0);checks++;
// Wall-clock values survive a different database connection timezone unchanged.
await db.exec("set timezone='Asia/Tokyo'");
const record=(await asUser(users.admin,'select arrival_date::text,arrival_time::text,description,description_preview,created_by from public.upcoming_drivers where id=$1',[id])).rows[0];
assert.equal(record.arrival_date,'2026-11-01');assert.equal(record.arrival_time,'01:30:00');checks+=2;
assert.equal(record.description,'Writer one');assert.equal(record.description_preview,'Writer one');assert.equal(record.created_by,users.admin);checks+=3;
await assert.rejects(asUser(users.admin,'update public.upcoming_drivers set arrival_date=null where id=$1',[id]));checks++;
assert.equal((await db.query('select count(*)::int as n from public.drivers')).rows[0].n,0);checks++;
assert.equal((await db.query('select driver_id from public.trucks')).rows[0].driver_id,null);checks++;
for(const message of (await db.query("select payload from realtime.messages where topic='upcoming-drivers'")).rows){
 assert.deepEqual(Object.keys(message.payload).sort(),['id','version']);
}
checks++;
const anonGrants=await db.query("select has_table_privilege('anon','public.upcoming_drivers','SELECT') as can_read,has_function_privilege('anon','public.upcoming_driver_staff()','EXECUTE') as can_call");
assert.deepEqual(anonGrants.rows[0],{can_read:false,can_call:false});checks++;
// Parent account/truck cleanup must preserve the candidate and its audit trail.
await db.query('delete from auth.users where id=$1',[users.recruiting]);
assert.equal((await db.query('select recruiter_id from public.upcoming_drivers where id=$1',[id])).rows[0].recruiter_id,null);checks++;
await db.query('delete from public.trucks where id=$1',[uid(100)]);
assert.equal((await db.query('select truck_id from public.upcoming_drivers where id=$1',[id])).rows[0].truck_id,null);checks++;
await db.query('delete from auth.users where id=$1',[users.admin]);
assert.equal((await db.query('select created_by from public.upcoming_drivers where id=$1',[id])).rows[0].created_by,null);checks++;
assert.ok((await db.query('select count(*)::int as n from public.upcoming_driver_history where upcoming_driver_id=$1',[id])).rows[0].n>0);checks++;
console.log(`Passed ${checks} database checks: exact roles, CRUD restrictions, private realtime, history, staff lookup, concurrency and Chicago wall-clock preservation.`);
await db.close();
