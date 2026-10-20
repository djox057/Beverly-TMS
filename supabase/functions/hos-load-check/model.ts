import { assessHos, wallTime, HOS_DEFAULTS, type HosAssessment, type HosLeg } from '../_shared/hos-planner.ts';
import tzLookup from 'npm:tz-lookup@6.1.25';

export function stopZone(stop: any) {
  if (Number.isFinite(Number(stop.latitude)) && Number.isFinite(Number(stop.longitude)) && stop.latitude != null && stop.longitude != null) {
    try { return tzLookup(Number(stop.latitude),Number(stop.longitude)); } catch { /* unknown location */ }
  }
  return null;
}
function geoMiles(a: any,b: any) {
  if ([a?.latitude,a?.longitude,b?.latitude,b?.longitude].some(v => v == null || !Number.isFinite(Number(v)))) return null;
  const r = Math.PI/180, x = (Number(b.latitude)-Number(a.latitude))*r, y=(Number(b.longitude)-Number(a.longitude))*r;
  const h=Math.sin(x/2)**2+Math.cos(Number(a.latitude)*r)*Math.cos(Number(b.latitude)*r)*Math.sin(y/2)**2;
  return 3959*2*Math.atan2(Math.sqrt(h),Math.sqrt(Math.max(0,1-h)));
}
export function buildLegs(stops: any[], dh: number, loaded: number, existing = false): {legs:HosLeg[]; warnings:string[]} {
  const warnings:string[]=[];
  const weights=stops.slice(1).map((s,i)=>geoMiles(stops[i],s));
  const total=weights.reduce<number>((sum,v)=>sum+(v??0),0);
  if (stops.length>2 && weights.some(w=>w==null)) warnings.push('Multi-stop mileage is divided approximately between stops.');
  const legs=stops.map((s,i)=>{
    const zone=stopZone(s);
    if (!zone && !warnings.includes('Stop timezone defaults to Chicago because coordinates are missing.')) warnings.push('Stop timezone defaults to Chicago because coordinates are missing.');
    const start=wallTime(s.datetime||'',zone||HOS_DEFAULTS.timeZone);
    const end=wallTime(s.end_datetime||s.datetime||'',zone||HOS_DEFAULTS.timeZone);
    return {miles:i===0 ? dh : total>0 && weights.every(w=>w!=null) ? loaded*(weights[i-1]||0)/total : loaded/Math.max(1,stops.length-1),
      start,end,label:`${s.type==='pickup'?'Pickup':'Delivery'} ${i+1}`,existing};
  });
  return {legs,warnings};
}

export async function loadHosPlan(db: any, draft: any, now = Date.now()): Promise<HosAssessment> {
  if (!draft.driverId) return assessHos({now,clock:null,days:[],legs:[]});
  if (![draft.dhMiles,draft.loadedMiles].every(v=>typeof v==='number' && Number.isFinite(v) && v>=0) || draft.loadedMiles===0) {
    return {color:'yellow',summary:'Complete deadhead and loaded route miles to check HOS.',reasons:[],assessedAt:new Date(now).toISOString()};
  }
  if (!draft.stops?.some((s:any)=>s.type==='pickup') || !draft.stops?.some((s:any)=>s.type==='delivery')) {
    return {color:'yellow',summary:'Add pickup and delivery stops to check HOS.',reasons:[],assessedAt:new Date(now).toISOString()};
  }
  const [driverRes,stateRes,daysRes,truckRes] = await Promise.all([
    db.from('drivers').select('id,name,dispatcher_id,hos_drive_minutes,hos_shift_minutes,hos_break_minutes,hos_cycle_minutes,hos_status,hos_last_updated').eq('id',draft.driverId).single(),
    db.from('driver_hos_state').select('*').eq('driver_id',draft.driverId).maybeSingle(),
    db.from('driver_hos_daily').select('*').eq('driver_id',draft.driverId).gte('log_date',new Date(now-9*86400000).toISOString().slice(0,10)),
    draft.truckId ? db.from('trucks').select('id,driver1_id,driver2_id').eq('id',draft.truckId).maybeSingle() : Promise.resolve({data:null}),
  ]);
  for (const r of [driverRes,stateRes,daysRes,truckRes]) if (r.error) throw new Error(r.error.message);
  const d=driverRes.data,s=stateRes.data;
  if (truckRes.data && ![truckRes.data.driver1_id,truckRes.data.driver2_id].includes(d.id)) {
    return {color:'yellow',summary:'Selected driver and truck assignment do not match.',reasons:[],assessedAt:new Date(now).toISOString()};
  }
  const driverChanged = s && s.truck_id !== (draft.truckId||null);
  const clock = driverChanged ? null : s ? {drive:s.drive_minutes,shift:s.shift_minutes,break:s.break_minutes,cycle:s.cycle_minutes,updatedAt:s.observed_at,sourceAt:s.source_at,status:s.status,restStartedAt:s.rest_started_at}
    : {drive:d.hos_drive_minutes,shift:d.hos_shift_minutes,break:d.hos_break_minutes,cycle:d.hos_cycle_minutes,updatedAt:d.hos_last_updated,status:d.hos_status};
  const target=buildLegs(draft.stops||[],draft.dhMiles,draft.loadedMiles);
  const uncertainties=[...target.warnings];
  if (!s) uncertainties.push('HOS history is starting; source freshness and rest progress are unconfirmed.');
  if (s && !s.source_at) uncertainties.push('The provider did not supply a source timestamp.');
  const firstPickup=target.legs.find(l=>l.label.startsWith('Pickup'));
  const {data:orders,error}=await db.from('orders')
    .select('id,driver1_id,driver2_id,truck_id,loaded_miles,dh_miles,pickup_datetime,delivery_datetime,status,pickup_drops(type,datetime,end_datetime,latitude,longitude,sequence_number,checked_out_at)')
    .or(`driver1_id.eq.${d.id},driver2_id.eq.${d.id}`).eq('canceled',false)
    .not('driver1_id','is',null).gte('delivery_datetime',new Date(now-2*86400000).toISOString())
    .order('pickup_datetime').limit(101);
  if(error) throw new Error(error.message);
  if((orders||[]).length>100) uncertainties.push('Too many open commitments to verify the complete schedule.');
  const existing:HosLeg[]=[];
  let previousCommitmentEnd=-Infinity;
  const ordered=[...(orders||[])].sort((a:any,b:any)=>
    wallTime(a.pickup_datetime||'',stopZone(a.pickup_drops?.[0])||HOS_DEFAULTS.timeZone)-wallTime(b.pickup_datetime||'',stopZone(b.pickup_drops?.[0])||HOS_DEFAULTS.timeZone));
  for(const order of ordered) {
    if(order.id===draft.orderId || order.status==='delivered') continue;
    const stops=[...(order.pickup_drops||[])].sort((a:any,b:any)=>(a.sequence_number||0)-(b.sequence_number||0));
    const open=stops.filter((p:any)=>!p.checked_out_at);
    if(!open.length) continue;
    const start=wallTime(order.pickup_datetime||'',stopZone(stops[0])||HOS_DEFAULTS.timeZone);
    if(!Number.isFinite(start)) { uncertainties.push('An existing load has no usable pickup time.'); continue; }
    if(!firstPickup) continue;
    if(start>firstPickup.start!) {
      if(start<target.legs[target.legs.length-1]?.end!) uncertainties.push('Another assigned load overlaps this load’s appointment window.');
      continue;
    }
    // The ELD snapshot already includes completed work; only future/remaining stops consume clocks.
    const remaining=buildLegs(open,Number(order.dh_miles)||0,Number(order.loaded_miles)||0,true);
    if(start<previousCommitmentEnd) uncertainties.push('Existing bookings overlap; their combined route needs confirmation.');
    const lastEnd=remaining.legs[remaining.legs.length-1]?.end;
    if(Number.isFinite(lastEnd)) previousCommitmentEnd=Math.max(previousCommitmentEnd,lastEnd!);
    if(start<now) {
      uncertainties.push('Remaining work on the current load needs confirmation.');
      for (const leg of remaining.legs) leg.uncertain = true;
      // Fresh telemetry measures only the first remaining leg; other legs retain their share.
      const telemetry=order.truck_id ? await db.from('truck_telemetry').select('miles_away,miles_away_updated_at').eq('truck_id',order.truck_id).maybeSingle() : {data:null};
      if(telemetry.data?.miles_away!=null && now-Date.parse(telemetry.data.miles_away_updated_at)<20*60000 && remaining.legs[0]) remaining.legs[0].miles=Number(telemetry.data.miles_away);
    }
    if (order.loaded_miles == null || order.dh_miles == null) {
      uncertainties.push('An existing load is missing route mileage.');
      for (const leg of remaining.legs) leg.uncertain = true;
    }
    existing.push(...remaining.legs);
  }
  return assessHos({now,clock,days:(daysRes.data||[]).map((day:any)=>({date:day.log_date,onDutyMinutes:Number(day.on_duty_minutes),observedMinutes:Number(day.observed_minutes),missingMinutes:Number(day.missing_minutes)})),
    legs:[...existing,...target.legs],timeZone:s?.log_timezone||HOS_DEFAULTS.timeZone,
    team:!!draft.teamDriverId||!!truckRes.data?.driver2_id,uncertainties:[...new Set(uncertainties)]});
}

export async function savedDraft(db:any,orderId:string) {
  const {data,error}=await db.from('orders').select('id,driver1_id,driver2_id,truck_id,dh_miles,loaded_miles,canceled,status,broker_load_number,internal_load_number,booked_by,pickup_drops(*)').eq('id',orderId).single();
  if(error) throw new Error(error.message);
  return {order:data,draft:{orderId:data.id,driverId:data.driver1_id,teamDriverId:data.driver2_id,truckId:data.truck_id,
    dhMiles:data.dh_miles==null?null:Number(data.dh_miles),loadedMiles:data.loaded_miles==null?null:Number(data.loaded_miles),
    stops:[...(data.pickup_drops||[])].sort((a:any,b:any)=>(a.sequence_number||0)-(b.sequence_number||0))}};
}
