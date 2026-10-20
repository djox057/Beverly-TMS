import { loadHosPlan, savedDraft } from './model.ts';
import { resolveManager } from '../send-pod-message/model.ts';
import { formatHosStopWindow } from './format-stop-window.ts';

const escape=(v:unknown)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export async function processHosChecks(db:any, targetOrder:string|null=null, fetcher:typeof fetch=fetch) {
  const claimed=await db.rpc('claim_hos_order_checks',{target_order:targetOrder});
  if(claimed.error) throw new Error(claimed.error.message);
  const outcomes:{orderId:string;color?:string;notified?:boolean;retry?:boolean}[]=[];
  for(const event of claimed.data||[]) {
    try {
      const {order,draft}=await savedDraft(db,event.order_id);
      if(order.canceled||order.status==='delivered'||order.driver1_id!==event.driver_id) {
        await finish(db,event.id,{status:'done',last_error:'Assignment changed or load is completed.'}); continue;
      }
      if(draft.stops.length<2) throw new Error('Waiting for order stops to finish saving.');
      const assessment=event.assessment||await loadHosPlan(db,draft);
      // Freeze the assessment for retries; a later clock refresh must not change an alert's contents.
      await finish(db,event.id,{assessment});
      if(assessment.color!=='red') { await finish(db,event.id,{status:'done'}); outcomes.push({orderId:event.order_id,color:assessment.color}); continue; }
      if(!event.dispatcher_id) throw new Error('The driver has no dispatcher assigned.');
      const dispatcher=await db.from('profiles').select('user_id,full_name,email,office').eq('user_id',event.dispatcher_id).single();
      if(dispatcher.error) throw new Error(dispatcher.error.message);
      const roleRows=await db.from('user_roles').select('user_id').eq('role','manager');
      if(roleRows.error) throw new Error(roleRows.error.message);
      const ids=[...new Set((roleRows.data||[]).map((r:any)=>r.user_id))];
      const managerRows=ids.length ? await db.from('profiles').select('user_id,full_name,email,office').in('user_id',ids).eq('office',dispatcher.data.office) : {data:[]};
      if(managerRows.error) throw new Error(managerRows.error.message);
      const manager=resolveManager(dispatcher.data,managerRows.data||[]);
      const auth=await db.auth.admin.getUserById(manager.user_id);
      if(auth.error||!auth.data?.user?.email) throw new Error('Office manager has no verified account email.');
      const driver=await db.from('drivers').select('name').eq('id',event.driver_id).single();
      const truck=draft.truckId ? await db.from('trucks').select('truck_number').eq('id',draft.truckId).maybeSingle() : {data:null};
      const key=Deno.env.get('RESEND_API_KEY');
      if(!key) throw new Error('Email service is not configured.');
      const html=`<h2>Red HOS warning — load created/assigned</h2><p><strong>${escape(assessment.summary)}</strong></p>
        <p>Dispatcher: ${escape(dispatcher.data.full_name)}<br>Office: ${escape(dispatcher.data.office)}<br>Driver: ${escape(driver.data?.name)}<br>Truck: ${escape(truck.data?.truck_number)}<br>Internal load: ${escape(order.internal_load_number)}<br>Broker load: ${escape(order.broker_load_number)}</p>
        <ul>${assessment.reasons.map((r:string)=>`<li>${escape(r)}</li>`).join('')}</ul>
        <p>${draft.stops.map((s:any)=>`${escape(s.type)}: ${escape(formatHosStopWindow(s.datetime,s.end_datetime))} (local stop time)`).join('<br>')}</p>
        <p>This is a planning estimate. Review the driver's ELD and appointment schedule.</p>
        <p><a href="https://beverlytms.com/edit-order/${encodeURIComponent(order.id)}">Open load</a></p>`;
      const response=await fetcher('https://api.resend.com/emails',{method:'POST',signal:AbortSignal.timeout(15000),headers:{Authorization:`Bearer ${key}`,'Content-Type':'application/json','Idempotency-Key':`hos-red-${event.id}`},
        body:JSON.stringify({from:'Beverly TMS <bob.i@bfprime.net>',to:[auth.data.user.email],subject:`Red HOS warning — Load ${order.broker_load_number||order.internal_load_number}`,html})});
      const payload=await response.json();
      if(!response.ok) throw new Error(`Email service rejected the alert (${response.status}).`);
      await finish(db,event.id,{status:'done',notified_at:new Date().toISOString(),recipient_user_id:manager.user_id,provider_message_id:payload.id,last_error:null});
      outcomes.push({orderId:event.order_id,color:'red',notified:true});
    } catch(error) {
      await finish(db,event.id,{status:event.attempts>=10?'failed':'retry',last_error:String(error instanceof Error?error.message:error).slice(0,400),available_at:new Date(Date.now()+5*60000).toISOString()});
      outcomes.push({orderId:event.order_id,retry:true});
    }
  }
  return outcomes;
}
async function finish(db:any,id:string,patch:any) {
  const {error}=await db.from('hos_order_checks').update({...patch,updated_at:new Date().toISOString()}).eq('id',id);
  if(error) throw new Error(error.message);
}
