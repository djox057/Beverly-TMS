import { processHosChecks } from './notifications.ts';
import { buildLegs, stopZone } from './model.ts';

function assert(value:unknown,message='Assertion failed'):asserts value {if(!value) throw new Error(message);}
function mockDb(color='red',office:string|null='Čačak',managers=1) {
  const event:any={id:'event-1',order_id:'order-1',driver_id:'driver-1',dispatcher_id:'dispatcher-1',attempts:1,assessment:{color,summary:'Pickup <late>',reasons:['Needs more time']}};
  const patches:any[]=[];
  let claimed=false;
  const db:any={rpc:()=>Promise.resolve({data:claimed?[]:(claimed=true,[event])}),auth:{admin:{getUserById:()=>Promise.resolve({data:{user:{email:'manager@example.test'}}})}},
    from(table:string) {
      let update:any;let single=false;
      const chain:any={select(){return this;},eq(){return this;},in(){return this;},single(){single=true;return this;},maybeSingle(){single=true;return this;},
        update(value:any){update=value;return this;},then(resolve:any,reject:any){
          if(update) {patches.push(update);Object.assign(event,update);return Promise.resolve({data:null}).then(resolve,reject);}
          let data:any;
          if(table==='orders') data={id:'order-1',driver1_id:'driver-1',truck_id:'truck-1',loaded_miles:550,dh_miles:55,broker_load_number:'B<123>',internal_load_number:1019001,pickup_drops:[{type:'pickup',datetime:'2026-10-20T06:30:00+00:00',end_datetime:'2026-10-20T14:00:00+00:00'},{type:'delivery',datetime:'2026-10-21T08:00:00+00:00',end_datetime:'2026-10-21T12:00:00+00:00'}]};
          if(table==='profiles') data=single ? {user_id:'dispatcher-1',office,full_name:'Dispatcher'} : Array.from({length:managers},(_,i)=>({user_id:`manager-${i}`,office:'Čačak',full_name:'Manager'}));
          if(table==='user_roles') data=[{user_id:'manager-0'}];
          if(table==='drivers') data={name:'Driver'};
          if(table==='trucks') data={truck_number:'123'};
          return Promise.resolve({data}).then(resolve,reject);
        }};return chain;
    }};
  return {db,event,patches};
}
Deno.test('red saved load routes one alert to the unique office manager, with stable retry key',async()=>{
  Deno.env.set('RESEND_API_KEY','test-only');
  const {db,patches}=mockDb();const sent:any[]=[];
  const fetcher=(async(_url:any,options:any)=>{sent.push(options);return Response.json({id:'email-1'});}) as typeof fetch;
  await processHosChecks(db,null,fetcher);await processHosChecks(db,null,fetcher);
  assert(sent.length===1,'A completed/claimed check cannot send twice');
  assert(sent[0].headers['Idempotency-Key']==='hos-red-event-1');
  const body=JSON.parse(sent[0].body);assert(body.to[0]==='manager@example.test');assert(body.html.includes('&lt;late&gt;'));
  assert(body.html.includes('pickup: 10/20/2026 06:30-14:00'));
  assert(body.html.includes('delivery: 10/21/2026 08:00-12:00'));
  assert(!body.html.includes('2026-10-20T'));
  assert(patches.some(p=>p.notified_at && p.status==='done'));
});
Deno.test('green and yellow checks do not send email',async()=>{
  for(const color of ['green','yellow']) {
    const {db,patches}=mockDb(color);let count=0;
    await processHosChecks(db,null,(async()=>{count++;return Response.json({});}) as typeof fetch);
    assert(count===0);assert(patches.some(p=>p.status==='done'));
  }
});
Deno.test('missing or ambiguous office managers keep the alert queued, never guess recipients',async()=>{
  for(const [office,n] of [[null,1],['Čačak',2]] as const) {
    const {db,patches}=mockDb('red',office,n);let count=0;
    await processHosChecks(db,null,(async()=>{count++;return Response.json({});}) as typeof fetch);
    assert(count===0);assert(patches.some(p=>p.status==='retry'));
  }
});
Deno.test('email failures retain the red assessment for an idempotent retry',async()=>{
  const {db,event,patches}=mockDb();
  await processHosChecks(db,null,(async()=>Response.json({error:'unavailable'},{status:503})) as typeof fetch);
  assert(event.assessment.color==='red');assert(patches.some(p=>p.status==='retry'&&p.last_error));
});
Deno.test('multi-stop allocation preserves total miles and local stop timezones',()=>{
  const result=buildLegs([{type:'pickup',datetime:'2026-10-20T08:00:00',latitude:41.88,longitude:-87.63},{type:'delivery',datetime:'2026-10-20T18:00:00',latitude:40.71,longitude:-74.00}],55,800);
  assert(result.legs[0].miles+result.legs[1].miles===855);
  assert(result.legs.every(leg=>leg.serviceMinutes===120));
  const multi=buildLegs([{type:'pickup'},{type:'pickup'},{type:'delivery'}],0,100);
  assert(multi.legs.every(leg=>leg.serviceMinutes===60));
  const remaining=buildLegs([{type:'delivery'}],0,100,true,120);
  assert(remaining.legs[0].serviceMinutes===120,'Remaining single-load delivery retains its two-hour service time');
  assert(stopZone({latitude:40.71,longitude:-74.00})==='America/New_York');
});
