import {test} from 'node:test';
import assert from 'node:assert/strict';
import {fresh,lowDrive,coverageWindow,coveringUser,deliveryTarget,estimatedRoadMiles} from '../../supabase/functions/send-low-drive-reminders/rules.ts';
const now=Date.parse('2026-10-20T17:00:00Z'), time=new Date(now).toISOString();
const state={truck_id:'t',drive_minutes:60,source_at:time,observed_at:time};
test('inclusive 60-minute threshold, zero, null, stale, future and assignment boundaries',()=>{
  assert.ok(lowDrive(state,'t',now));
  assert.ok(lowDrive({...state,drive_minutes:0},'t',now));
  for(const drive_minutes of [null,undefined,-1,61,NaN,'30']) assert.equal(lowDrive({...state,drive_minutes},'t',now),false);
  assert.equal(lowDrive(state,'other',now),false);
  assert.equal(lowDrive({...state,source_at:new Date(now-1200001).toISOString()},'t',now),false);
  assert.equal(fresh(new Date(now+1).toISOString(),now,20),false);
  assert.equal(fresh(new Date(now-1200000).toISOString(),now,20),true);
  assert.equal(fresh(undefined,now,20),false);
});
test('coverage follows active Serbia shift, Chicago date, midnight and DST',()=>{
  const w=coverageWindow(new Date('2026-10-21T02:00:00Z'));
  assert.equal(w.scheduledDate,'2026-10-20');assert.equal(w.shift,'night');
  const weekend=[{driver_id:'d',afterhours_user_id:'weekend',scheduled_date:w.chicagoDate}];
  const shifts=[{driver_id:'d',afterhours_user_id:'night',scheduled_date:w.scheduledDate,shift:'night'},{driver_id:'d',afterhours_user_id:'morning',scheduled_date:w.today,shift:'morning'}];
  assert.equal(coveringUser('d',weekend,shifts,w),'night');
  const morning=coverageWindow(new Date('2026-10-21T06:00:00Z'));
  assert.equal(coveringUser('d',weekend,shifts,morning),'morning');
  assert.equal(coveringUser('d',[],[],morning),null);
  assert.throws(()=>coveringUser('d',[...weekend,{...weekend[0],afterhours_user_id:'second'}],[],w));
  assert.equal(coverageWindow(new Date('2026-10-26T05:00:00Z')).shift,'morning');
});
const pickup={id:'p',type:'pickup',sequence_number:1};
const drop={id:'s',type:'delivery',sequence_number:2,latitude:42,longitude:-88};
const order={status:'in_transit',order_files:[{file_category:'BOL'}],pickup_drops:[drop,pickup]};
test('only picked-up active freight and next undelivered stop qualify',()=>{
  assert.equal(deliveryTarget(order).id,'s');
  for(const o of [{...order,canceled:true},{...order,status:'delivered'},{...order,order_files:[]},{...order,order_files:[...order.order_files,{file_category:'POD'}]},{...order,pickup_drops:[pickup,{...drop,arrived_at:time}]},{...order,pickup_drops:[pickup,{...drop,checked_out_at:time}]}]) assert.equal(deliveryTarget(o),null);
  const next={...drop,id:'s2',sequence_number:3};
  assert.equal(deliveryTarget({...order,pickup_drops:[pickup,{...drop,checked_out_at:time},next]}).id,'s2');
  assert.equal(deliveryTarget({...order,pickup_drops:[pickup,{...pickup,id:'p2',sequence_number:2},next]}),null);
});
test('distance validates missing coordinates and keeps unrounded 40-mile boundary',()=>{
  assert.equal(estimatedRoadMiles({latitude:42,longitude:-88},drop),0);
  assert.equal(estimatedRoadMiles({latitude:42,longitude:-88},{latitude:null,longitude:null}),null);
  const latitude=42+40/(3959*Math.PI/180*1.3);
  assert.ok(Math.abs(estimatedRoadMiles({latitude:42,longitude:-88},{latitude,longitude:-88})-40)<1e-9);
  assert.ok(estimatedRoadMiles({latitude:42,longitude:-88},{latitude:latitude-0.001,longitude:-88})<40);
});
import {processReminders} from '../../supabase/functions/send-low-drive-reminders/worker.ts';
function fixture() {
  const data={samsara_locations_cache:{fetched_at:time,locations:[{truck_id:'t',latitude:41,longitude:-88,timestamp:time,isValid:true}]},orders:[{...order,id:'o',truck_id:'t',driver1_id:'d',internal_load_number:'123'}],trucks:[{id:'t',truck_number:'100',driver1_id:'d'}],drivers:[{id:'d',name:'Driver',dispatcher_id:'dispatch'}],driver_hos_state:[{...state,driver_id:'d'}],profiles:[{user_id:'dispatch',office:'Office'},{user_id:'manager',office:'Office'}],user_roles:[{user_id:'manager'}],afterhours_schedule:[],afterhours_shift_assignments:[],afterhours_assignments:[]};
  const events=new Map();let eventId=0;
  const db={from(table){let update=null,filterId=null;const q={select(){return q},eq(key,value){if(key==='id')filterId=value;return q},not(){return q},lte(){return q},gte(){return q},limit(){return q},order(){return q},range(){return q},maybeSingle(){return q},update(value){update=value;return q},then(resolve){if(update) {for(const event of events.values())if(event.id===filterId)Object.assign(event,update);return Promise.resolve({data:[]}).then(resolve);}return Promise.resolve({data:data[table]}).then(resolve)}};return q},rpc(_name,args){const key=JSON.stringify(args);let event=events.get(key);if(event?.sent_at)return {data:[]};if(!event){event={id:`event-${++eventId}`};events.set(key,event)}return {data:[event]}},auth:{admin:{getUserById:async id=>({data:{user:{email:`${id}@example.com`}}})}}};
  return {db,data,events};
}
test('worker sends dispatcher + manager once, freezes retry payload and deduplicates',async()=>{
  const f=fixture(),emails=[];const send=async(_url,init)=>{emails.push(JSON.parse(init.body));return Response.json({id:'mail'})};
  const r=await processReminders(f.db,{apiKey:'test'},send,now);
  assert.equal(r.sent,2);assert.deepEqual(emails.map(e=>e.to[0]).sort(),['dispatch@example.com','manager@example.com']);
  assert.equal((await processReminders(f.db,{apiKey:'test'},send,now)).sent,0);
  assert.equal(emails.length,2);
});
test('dry run, stale GPS and stale HOS never send or claim',async()=>{
  for(const mode of ['dry','gps','hos']){
    const f=fixture();if(mode==='gps')f.data.samsara_locations_cache.locations[0].timestamp='2020-01-01T00:00:00Z';
    if(mode==='hos')f.data.driver_hos_state[0].source_at='2020-01-01T00:00:00Z';
    await processReminders(f.db,{dryRun:mode==='dry',apiKey:'test'},async()=>{throw new Error('Unexpected email')},now);
    assert.equal(f.events.size,0);
  }
});
test('weekend person replaces dispatcher while manager remains; failure retries same payload',async()=>{
  const f=fixture(),window=coverageWindow(new Date(now));f.data.afterhours_schedule=[{id:'schedule'}];
  f.data.afterhours_assignments=[{id:'a',driver_id:'d',afterhours_user_id:'cover',scheduled_date:window.chicagoDate}];
  f.data.profiles.push({user_id:'cover',office:'Office'});
  const bodies=[];const fail=async(_url,init)=>{bodies.push(init.body);return new Response('{}',{status:503})};
  assert.equal((await processReminders(f.db,{apiKey:'test'},fail,now)).failed,2);
  f.data.driver_hos_state[0].drive_minutes=30;
  const send=async(_url,init)=>{bodies.push(init.body);return Response.json({id:'mail'})};
  assert.equal((await processReminders(f.db,{apiKey:'test'},send,now)).sent,2);
  assert.equal(bodies[0],bodies[2]);assert.equal(bodies[1],bodies[3]);
  assert.deepEqual(bodies.slice(2).map(b=>JSON.parse(b).to[0]).sort(),['cover@example.com','manager@example.com']);
});
