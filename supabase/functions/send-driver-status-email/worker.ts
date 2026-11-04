import { buildEmail } from './report.ts';

async function rows(query: any): Promise<any[]> {
  const {data,error}=await query;
  if(error) throw new Error(error.message);
  return data || [];
}
async function pages(make:()=>any): Promise<any[]> {
  const all:any[]=[];
  for(let offset=0;offset<10000;offset+=500) {
    const page=await rows(make().order('id').range(offset,offset+499));
    all.push(...page);
    if(page.length<500) return all;
  }
  throw new Error('Driver history exceeded safe pagination limit');
}

// Driver-specific reads include original and intermediate recovery assignments.
// No fleet-wide orders fetch and no documents/attachments are loaded.
export async function driverOrders(db:any,driverId:string) {
  const transfers=await pages(()=>db.from('order_transfers').select('id,order_id').or(`driver1_id.eq.${driverId},driver2_id.eq.${driverId}`));
  const fields='id,load_number,driver1_id,driver2_id,original_driver1_id,original_driver2_id,delivery_datetime,driver_price,detention_driver,layover_driver,tonu,tonu_driver,extra_stop_driver,lumper_driver,other_additionals_driver,late_fee_driver,no_tracking_fee_driver,wrong_address_fee_driver,other_charges_driver,loaded_miles,dh_miles,additional_miles,is_recovery,original_driver_price,original_miles,recovery_driver_price,recovery_miles,recovery_date,canceled,prebook,p_status,order_transfers(sequence_number,driver1_id,driver2_id,miles,driver_price,transfer_datetime),recovery_history(recovery_driver1_id,recovery_driver2_id,reverted_at,created_at),order_week_overrides(target_week_start)';
  const orders=await pages(()=>db.from('orders').select(fields).or(`driver1_id.eq.${driverId},driver2_id.eq.${driverId},original_driver1_id.eq.${driverId},original_driver2_id.eq.${driverId}`));
  const map=new Map(orders.map(o=>[o.id,o]));
  const missing=[...new Set(transfers.map(t=>t.order_id))].filter(id=>!map.has(id));
  for(let i=0;i<missing.length;i+=100) {
    for(const o of await pages(()=>db.from('orders').select(fields).in('id',missing.slice(i,i+100)))) map.set(o.id,o);
  }
  return [...map.values()];
}


export async function cdlAttachments(db:any,driverId:string) {
  const files=await rows(db.from('driver_files').select('id,file_name,file_path,keywords,created_at').eq('driver_id',driverId).order('created_at',{ascending:false}));
  const selected:any[]=[];
  for(const side of ['front','back']) {
    const file=files.find(f=>{
      const keywords=Array.isArray(f.keywords)?f.keywords:[];
      const name=String(f.file_name||'');
      return keywords.includes('cdl_'+side) || new RegExp('(?:cdl|license).*'+side+'|'+side+'.*(?:cdl|license)','i').test(name);
    });
    if(file && !selected.some(f=>f.id===file.id)) selected.push(file);
  }
  const attachments=[];
  for(const file of selected) {
    const {data,error}=await db.storage.from('driver-files').download(file.file_path);
    if(error || !data) throw new Error('Unable to download CDL attachment');
    const bytes=new Uint8Array(await data.arrayBuffer());
    if(bytes.length>15*1024*1024) throw new Error('CDL attachment exceeds email size limit');
    let binary='';
    for(let offset=0;offset<bytes.length;offset+=8192) binary+=String.fromCharCode(...bytes.subarray(offset,offset+8192));
    attachments.push({filename:file.file_name,content:btoa(binary)});
  }
  return attachments;
}

export async function processEmails(db:any,apiKey:string|undefined,eventId?:string,fetcher:typeof fetch=fetch) {
  if(!apiKey) throw new Error('Email provider is not configured');
  let sent=0,failed=0;
  for(let i=0;i<(eventId?1:10);i++) {
    const events=await rows(db.rpc('claim_driver_status_email',{p_event_id:eventId||null}));
    const event=events[0];
    if(!event) break;
    try {
      const payload=event.email_payload || {...buildEmail(event,await driverOrders(db,event.driver_id)),attachments:await cdlAttachments(db,event.driver_id)};
      // Persist the exact provider payload before sending: retries remain identical.
      if(!event.email_payload) await rows(db.from('driver_status_emails').update({email_payload:payload}).eq('id',event.id).eq('claim_token',event.claim_token));
      const response=await fetcher('https://api.resend.com/emails',{
        method:'POST',signal:AbortSignal.timeout(15000),
        headers:{'Content-Type':'application/json',Authorization:`Bearer ${apiKey}`,'Idempotency-Key':`driver-status-${event.id}`},
        body:JSON.stringify(payload),
      });
      if(!response.ok) throw new Error(`Email provider HTTP ${response.status}`);
      const result=await response.json();
      if(!result.id) throw new Error('Email provider did not return a message ID');
      await rows(db.from('driver_status_emails').update({sent_at:new Date().toISOString(),provider_message_id:result.id,last_error:null}).eq('id',event.id).eq('claim_token',event.claim_token));
      sent++;
    } catch(error) {
      const message=error instanceof Error ? error.message : 'Unknown error';
      await rows(db.from('driver_status_emails').update({last_error:message.slice(0,300),claimed_at:null,next_attempt_at:new Date(Date.now()+Math.min(60,2**event.attempts)*60000).toISOString()}).eq('id',event.id).eq('claim_token',event.claim_token));
      failed++;
    }
  }
  return {sent,failed};
}
