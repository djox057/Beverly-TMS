import { coveringUser, coverageWindow, deliveryTarget, estimatedRoadMiles, fresh, GPS_MAX_AGE_MINUTES, lowDrive } from './rules.ts';
const escape = (v: unknown) => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
async function rows(query: any) {
  const result = await query;
  if (result.error) throw new Error(result.error.message);
  return result.data || [];
}
async function all(db: any, table: string, select: string, apply: (q:any)=>any = q=>q) {
  const result: any[] = [];
  for (let offset=0;;offset+=500) {
    const page = await rows(apply(db.from(table).select(select)).order('id').range(offset,offset+499));
    result.push(...page);
    if(page.length<500) return result;
  }
}
export async function processReminders(db: any, options: {dryRun?: boolean;apiKey?: string}, fetcher: typeof fetch = fetch, now = Date.now()) {
  const window = coverageWindow(new Date(now));
  const cache = await db.from('samsara_locations_cache').select('locations,fetched_at').eq('id','latest').maybeSingle();
  if(cache.error) throw new Error(cache.error.message);
  if(!fresh(cache.data?.fetched_at,now,20)) return {sent:0,skipped:'Samsara cache is stale'};
  const locations = new Map<string,any>((cache.data.locations || []).filter((g:any)=>g.isValid !== false && fresh(g.timestamp,now,GPS_MAX_AGE_MINUTES)).map((g:any)=>[g.truck_id,g]));
  const [orders, trucks, states, drivers, profiles, managers, schedule, shifts] = await Promise.all([
    all(db,'orders','id,truck_id,driver1_id,driver2_id,canceled,status,internal_load_number,broker_load_number,order_files(file_category),pickup_drops(id,type,sequence_number,arrived_at,checked_out_at,latitude,longitude,city,state)',q=>q.eq('canceled',false).not('truck_id','is',null).not('status','in','(delivered,completed,canceled)')),
    all(db,'trucks','id,truck_number,driver1_id,driver2_id'),
    rows(db.from('driver_hos_state').select('*').lte('drive_minutes',60).gte('drive_minutes',0).gte('observed_at',new Date(now-20*60000).toISOString()).gte('source_at',new Date(now-20*60000).toISOString()).limit(1000)),
    all(db,'drivers','id,name,dispatcher_id'),
    // Profiles use user_id rather than id as their stable lookup key.
    rows(db.from('profiles').select('user_id,full_name,email,office').limit(1000)),
    rows(db.from('user_roles').select('user_id').eq('role','manager').limit(1000)),
    rows(db.from('afterhours_schedule').select('id').eq('scheduled_date',window.chicagoDate)),
    window.shift ? all(db,'afterhours_shift_assignments','id,driver_id,afterhours_user_id,scheduled_date,shift',q=>q.eq('scheduled_date',window.scheduledDate).eq('shift',window.shift)) : [],
  ]);
  const weekend = schedule.length ? await all(db,'afterhours_assignments','id,driver_id,afterhours_user_id,scheduled_date',q=>q.eq('scheduled_date',window.chicagoDate)) : [];
  const truckMap=new Map(trucks.map((t:any)=>[t.id,t]));
  const driverMap=new Map(drivers.map((d:any)=>[d.id,d]));
  const profileMap=new Map<string,any>(profiles.map((p:any)=>[p.user_id,p]));
  const managerIds=new Set(managers.map((m:any)=>m.user_id));
  let eligible=0,sent=0,failed=0,deduplicated=0;
  const candidates:any[]=[];
  for(const state of states) {
    const truck:any=truckMap.get(state.truck_id), driver:any=driverMap.get(state.driver_id);
    if(!truck || !driver || ![truck.driver1_id,truck.driver2_id].includes(driver.id) || !lowDrive(state,truck.id,now)) continue;
    const gps=locations.get(truck.id);
    if(!gps) continue;
    const active=orders.filter((o:any)=>o.truck_id===truck.id && [o.driver1_id,o.driver2_id].includes(driver.id) && deliveryTarget(o));
    // Ambiguous overlapping active loads must be corrected instead of choosing an arbitrary destination.
    if(active.length!==1) continue;
    const order=active[0], stop=deliveryTarget(order), miles=estimatedRoadMiles(gps,stop);
    if(miles===null || miles<40) continue;
    eligible++;
    try {
      const dispatcher:any=profileMap.get(driver.dispatcher_id);
      if(!dispatcher?.office) throw new Error('Driver dispatcher/office missing');
      const officeManagers=profiles.filter((p:any)=>managerIds.has(p.user_id) && p.office===dispatcher.office);
      if(officeManagers.length!==1) throw new Error('Office manager is ambiguous or missing');
      const cover=coveringUser(driver.id,weekend,shifts,window);
      const ids=[...new Set([cover || driver.dispatcher_id,officeManagers[0].user_id])];
      candidates.push({orderId:order.id,driverId:driver.id,driveMinutes:state.drive_minutes,miles:Math.round(miles),recipientUserIds:ids,coverage:!!cover});
      if(options.dryRun) continue;
      if(!options.apiKey) throw new Error('Email service missing');
      for(const recipientId of ids) {
        const claim=await db.rpc('claim_low_drive_reminder',{p_order:order.id,p_driver:driver.id,p_stop:stop.id,p_recipient:recipientId});
        if(claim.error) throw new Error(claim.error.message);
        const event=claim.data?.[0];
        if(!event) {deduplicated++;continue;}
        try {
          const auth=await db.auth.admin.getUserById(recipientId);
          if(auth.error || !auth.data?.user?.email) throw new Error('Recipient account email missing');
          const emailPayload=event.email_payload || {
            from:'Beverly TMS <jon@bfprime.net>',to:[auth.data.user.email],
            subject:`Low driving hours — Truck ${truck.truck_number} — Load ${order.broker_load_number || order.internal_load_number}`,
            html:`<h2>Low driving hours before delivery</h2><p>${escape(driver.name)} has <strong>${state.drive_minutes} minutes</strong> of driving time remaining and is approximately <strong>${Math.round(miles)} miles</strong> from the next delivery (${escape(stop.city)}, ${escape(stop.state)}).</p><p>Truck: ${escape(truck.truck_number)}<br>Load: ${escape(order.internal_load_number)} / ${escape(order.broker_load_number)}<br>Dispatcher: ${escape(dispatcher.full_name)}<br>Current coverage: ${escape(cover ? profileMap.get(cover)?.full_name : 'Regular dispatcher')}</p><p>HOS source: ${escape(state.source_at)}<br>Samsara GPS: ${escape(gps.timestamp)}</p><p>Distance uses the TMS estimate (straight-line × 1.3). Review the ELD, route and delivery appointment.</p><p><a href="https://beverlytms.com/edit-order/${encodeURIComponent(order.id)}">Open load</a></p>`};
          if(!event.email_payload) await rows(db.from('low_drive_reminders').update({email_payload:emailPayload}).eq('id',event.id));
          const response=await fetcher('https://api.resend.com/emails',{method:'POST',signal:AbortSignal.timeout(15000),headers:{Authorization:`Bearer ${options.apiKey}`,'Content-Type':'application/json','Idempotency-Key':`low-drive-${event.id}`},body:JSON.stringify(emailPayload)});
          if(!response.ok) throw new Error(`Email service status ${response.status}`);
          const payload=await response.json();
          await rows(db.from('low_drive_reminders').update({sent_at:new Date(now).toISOString(),provider_message_id:payload.id,last_error:null}).eq('id',event.id));
          sent++;
        } catch(error) {
          await rows(db.from('low_drive_reminders').update({last_error:String(error instanceof Error?error.message:error).slice(0,300)}).eq('id',event.id));
          failed++;
        }
      }
    } catch(error) {failed++;console.error('Low-drive candidate failed',String(error instanceof Error?error.message:error));}
  }
  return {dryRun:!!options.dryRun,eligible,sent,failed,deduplicated,...(options.dryRun?{candidates}:{})};
}
