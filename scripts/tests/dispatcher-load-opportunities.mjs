/**
 * Isolated SQL regression checks. Never connects to the hosted database.
 * Optional test dependency (kept out of the frontend dependency tree):
 *   npm install --prefix /tmp/beverly-sql-tests @electric-sql/pglite@0.3.14
 *   PGLITE_MODULE=/tmp/beverly-sql-tests/node_modules/@electric-sql/pglite/dist/index.js node scripts/tests/dispatcher-load-opportunities.mjs
 */
const { PGlite } = await import(process.env.PGLITE_MODULE || '@electric-sql/pglite');
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const db=new PGlite();
await db.exec(await readFile(new URL('./dispatcher-load-opportunities-schema.sql', import.meta.url),'utf8'));
await db.exec(await readFile(new URL('../../supabase/migrations/20261102135539_dispatcher_load_opportunities.sql', import.meta.url),'utf8'));
await db.exec(await readFile(new URL('../../supabase/migrations/20261103153804_dispatcher_available_load_match_arrows.sql', import.meta.url),'utf8'));
const uuid=n=>`00000000-0000-0000-0000-${String(n).padStart(12,'0')}`;
const me=uuid(1), other=uuid(2), driver=uuid(3), otherDriver=uuid(4), truck=uuid(5), second=uuid(6), theirs=uuid(7), ap=uuid(8), bf=uuid(9), bfp=uuid(10);
await db.query('insert into user_roles values ($1,\'dispatch\'),($2,\'dispatch\')',[me,other]);
await db.query('insert into companies values($1,\'AP Silver Trans LLC\'),($2,\'Beverly Freight Inc\'),($3,\'BF Prime LLC\')',[ap,bf,bfp]);
await db.query('insert into drivers(id,dispatcher_id) values($1,$2),($3,$4)',[driver,me,otherDriver,other]);
await db.query('insert into trucks(id,driver1_id,company_id) values($1,$2,$3),($4,$2,$3),($5,$6,$3)',[truck,driver,ap,second,theirs,otherDriver]);
const order=async (n,truckId,pickup,delivery,extra={})=>{
 const values={id:uuid(n),truck_id:truckId,driver1_id:truckId?driver:null,pickup_datetime:pickup,delivery_datetime:delivery,booked_by_company_id:bfp,...extra};
 const cols=Object.keys(values); await db.query(`insert into orders(${cols.join(',')}) values(${cols.map((_,i)=>'$'+(i+1)).join(',')})`,Object.values(values));return uuid(n);
};
let seq=1000;
const stop=async (orderId,type,lat,time,number=1,end=null)=>db.query('insert into pickup_drops values($1,$2,$3,$4,$5,$6,$7,-90)',[uuid(seq++),orderId,type,number,time,end,lat]);
const pu='2099-11-02T14:00:00Z',del='2099-11-02T08:00:00Z';
const origin=await order(20,truck,'2099-11-01T09:00:00Z',del);await stop(origin,'delivery',40,del,3);
const origin2=await order(21,second,'2099-11-01T09:00:00Z',del);await stop(origin2,'delivery',40,del,3);
const origin3=await order(22,theirs,'2099-11-01T09:00:00Z',del);await stop(origin3,'delivery',43,del,3);
const pre=await order(30,null,pu,null,{prebook:true});await stop(pre,'pickup',40,pu);
const rec=await order(31,theirs,pu,null,{retrieval:true});await stop(rec,'pickup',40.5,pu);
const foreign=await order(32,null,pu,null,{prebook:true});await stop(foreign,'pickup',43,pu);
await db.query('select set_config(\'request.jwt.claim.sub\',$1,false)',[me]);
await db.exec('set role authenticated');
const read=async()=> (await db.query('select * from get_dispatcher_load_opportunities_v2()')).rows[0];
let checks=0;
const counts=async (p,r,label)=>{const row=await read(); assert.equal(row.prebook_count,p,label+' prebook');assert.equal(row.recovery_count,r,label+' recovery');checks++;};
const admin=async sql=>{await db.exec('reset role');await db.exec(sql);await db.exec('set role authenticated');};
await counts(1,1,'deduplicates own trucks and excludes other dispatcher');
assert.deepEqual((await read()).matched_order_ids.sort(),[pre,rec].sort());
await admin(`update orders set p_status=null where id='${pre}'`);await counts(0,1,'only explicit Available status counts');
assert.deepEqual((await read()).matched_order_ids,[rec]);
await admin(`update orders set p_status='Available' where id='${pre}'`);
assert.deepEqual((await read()).truck_ids.sort(),[truck,second].sort());
await admin(`update trucks set is_active=false where id='${second}'`);
await admin(`update pickup_drops set latitude=41.10 where order_id='${pre}'`);await counts(1,1,'99 miles qualifies');
await admin(`update pickup_drops set latitude=41.113 where order_id='${pre}'`);await counts(0,1,'100 miles excluded');
await admin(`update pickup_drops set latitude=40 where order_id='${pre}'`);
await admin(`update pickup_drops set datetime='2099-11-01T08:00:00Z' where order_id='${origin}'; update orders set delivery_datetime='2099-11-01T08:00:00Z' where id='${origin}'`);await counts(0,0,'previous day excluded');
await admin(`update pickup_drops set datetime='2099-11-02T15:00:00Z' where order_id='${origin}'`);await counts(0,0,'later than pickup excluded');
await admin(`update pickup_drops set datetime='${del}',latitude=null where order_id='${origin}'`);await counts(0,0,'missing coords excluded');
await admin(`update pickup_drops set latitude=40 where order_id='${origin}'`);await counts(1,1,'same day pickup restored');
await admin(`update orders set booked_by_company_id='${bf}' where id='${pre}'`);await counts(0,1,'company restriction applies only to prebook');
await admin(`update orders set booked_by_company_id='${bfp}',p_status='Covered' where id='${pre}'`);await counts(0,1,'covered unavailable');
await admin(`update orders set p_status='Available',canceled=true where id='${pre}'`);await counts(0,1,'canceled unavailable');
await admin(`update orders set canceled=false where id='${pre}';update orders set recovery_assigned=true where id='${rec}'`);await counts(1,0,'assigned recovery unavailable');
await admin(`update orders set recovery_assigned=false where id='${rec}';insert into order_files values('${uuid(50)}','${pre}','POD')`);await counts(0,1,'POD unavailable');
await admin('delete from order_files');
// Inserting an ordinary load must replace the old nearby delivery; then cancellation restores it.
await db.exec('reset role');const newer=await order(40,truck,'2099-11-02T09:00:00Z','2099-11-03T08:00:00Z');await stop(newer,'delivery',40,'2099-11-03T08:00:00Z',2);await db.exec('set role authenticated');
await counts(0,0,'new ordinary load blocks older nearby delivery');
await admin(`update orders set canceled=true where id='${newer}'`);await counts(1,1,'canceling newer load restores matches');
await admin(`update drivers set dispatcher_id='${other}' where id='${driver}'`);await counts(0,0,'driver reassignment removes own trucks');
await admin(`update drivers set dispatcher_id='${me}' where id='${driver}'`);
await admin(`insert into user_roles values('${me}','supervisor')`);await counts(0,0,'supervisor inheriting dispatch excluded');
await admin(`delete from user_roles where role='supervisor';insert into user_roles values('${me}','admin')`);await counts(0,0,'admin inheriting dispatch excluded');
await admin(`delete from user_roles where role='admin'`);
// At 00:30 TMS wall time, delivery at 23:30 the previous displayed day must not qualify.
await admin(`update pickup_drops set datetime='2099-11-02T00:30:00Z' where order_id='${pre}';update pickup_drops set datetime='2099-11-01T23:30:00Z' where order_id='${origin}';update orders set delivery_datetime='2099-11-01T23:30:00Z' where id='${origin}'`);await counts(0,0,'wall-clock day boundary');
// Function must remain invoker and anonymous execution must be denied.
await db.exec('reset role');
assert.equal((await db.query("select prosecdef from pg_proc where proname='get_dispatcher_load_opportunities'")).rows[0].prosecdef,false);
assert.equal((await db.query("select has_function_privilege('anon','public.get_dispatcher_load_opportunities()','EXECUTE') as allowed")).rows[0].allowed,false);
console.log(`${checks} SQL scenarios passed, plus ownership metadata and function security checks`);
await db.close();
