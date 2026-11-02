// Payroll weeks follow Trips: Tuesday through Monday. Monetary values are
// driver-side amounts, deliberately labelled "Freight amount" in this email.
type Row = Record<string, any>;
const num = (v: unknown): number => Number.isFinite(Number(v)) ? Number(v) : 0;
const date = (v: unknown): string => String(v || '').slice(0, 10);
const addDays = (v: string, days: number) => new Date(Date.parse(`${v}T12:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
export const weekStart = (v: string) => addDays(v, -((new Date(`${v}T12:00:00Z`).getUTCDay() + 5) % 7));
export const chicagoDate = (v: string) => new Intl.DateTimeFormat('en-CA', {timeZone:'America/Chicago', year:'numeric', month:'2-digit', day:'2-digit'}).format(new Date(v));
const matches = (id: string, a: unknown, b: unknown) => id === a || id === b;
export const actionLabels: Record<string, string> = {
  two_week_notice: '2-week notice given',
  two_week_cancelled: '2-week notice cancelled',
  done: 'Marked as done',
  continued_driving: 'Continued driving / reactivated',
  two_week_updated: '2-week notice date changed',
};

function basePay(o: Row): number {
  return ['driver_price','detention_driver','layover_driver','tonu_driver','extra_stop_driver','lumper_driver','other_additionals_driver'].reduce((s,k)=>s+num(o[k]),0)
    - ['late_fee_driver','no_tracking_fee_driver','wrong_address_fee_driver','other_charges_driver'].reduce((s,k)=>s+num(o[k]),0);
}

export function segments(o: Row): Row[] {
  const end = date(o.delivery_datetime);
  const ordinary = {driver1:o.driver1_id,driver2:o.driver2_id,pay:basePay(o),miles:num(o.loaded_miles)+num(o.dh_miles)+num(o.additional_miles),end};
  if (!o.is_recovery) return [ordinary];
  const transfers = [...(o.order_transfers || [])].sort((a,b)=>a.sequence_number-b.sequence_number);
  const legacy = !!o.original_driver1_id && (num(o.original_driver_price)>0 || num(o.original_miles)>0);
  const result: Row[] = [];
  const sequences = new Set(transfers.map(t=>Number(t.sequence_number)));
  if (legacy && !sequences.has(0)) result.push({driver1:o.original_driver1_id,driver2:o.original_driver2_id,pay:num(o.original_driver_price),miles:num(o.original_miles),end});
  if (legacy && !sequences.has(1)) {
    const history = (o.recovery_history || []).filter((h:Row)=>!h.reverted_at).sort((a:Row,b:Row)=>String(b.created_at).localeCompare(String(a.created_at)))[0];
    result.push({...ordinary,driver1:history?.recovery_driver1_id || o.driver1_id,driver2:history?.recovery_driver2_id || o.driver2_id,pay:num(o.recovery_driver_price)||ordinary.pay,miles:num(o.recovery_miles)||ordinary.miles,end:transfers.length ? date(o.recovery_date)||end : end});
  }
  for (const t of transfers) {
    const original = Number(t.sequence_number)===0;
    result.push({driver1:original ? o.original_driver1_id||t.driver1_id : t.driver1_id,driver2:original ? o.original_driver2_id||t.driver2_id : t.driver2_id,pay:num(t.driver_price ?? (original ? o.original_driver_price : 0)),miles:num(t.miles ?? (original ? o.original_miles : 0)),end:date(t.transfer_datetime)||end});
  }
  return result.length ? result : [ordinary];
}

export function weeklySummary(orders: Row[], driverId: string, occurredAt: string) {
  const today = chicagoDate(occurredAt);
  const current = weekStart(today);
  const weeks = [0,1,2].map(i=>({start:addDays(current,-7*i),end:addDays(current,6-7*i),freight:0,miles:0,rpm:0,loads:0}));
  for (const o of orders) {
    // Empty planning rows, GAME-OVER, and cancelled loads without TONU have no earnings.
    if (o.prebook && o.p_status!=='Covered') continue;
    if (o.load_number==='GAME-OVER' || (o.canceled && num(o.tonu)===0 && num(o.tonu_driver)===0)) continue;
    for (const s of segments(o)) {
      if (!matches(driverId,s.driver1,s.driver2) || !/^\d{4}-\d{2}-\d{2}$/.test(s.end) || s.end>today) continue;
      const override = o.order_week_overrides?.[0]?.target_week_start;
      const key = override || weekStart(s.end);
      const w = weeks.find(w=>w.start===key);
      if (!w) continue;
      w.freight+=s.pay; w.miles+=s.miles; w.loads++;
    }
  }
  for (const w of weeks) w.rpm=w.miles>0 ? w.freight/w.miles : 0;
  return weeks;
}

export function tenure(driver: Row, occurredAt: string, action: string): string {
  const start=date(driver.hire_date);
  const today=chicagoDate(occurredAt);
  const end=action==='done' ? date(driver.termination_date)||today : today;
  if (!start) return 'Unknown — hire date is not recorded';
  if (start>end) return 'Unknown — hire date is after the status date';
  const days=Math.round((Date.parse(`${end}T12:00:00Z`)-Date.parse(`${start}T12:00:00Z`))/86400000);
  return `${Math.floor(days/7)} weeks, ${days%7} days (${days} days; ${start} to ${end})`;
}

const escape = (v:unknown) => String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
const money = (v:number) => new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(v);
export function buildEmail(event: Row, orders: Row[]) {
  const d=event.driver_snapshot;
  const label=actionLabels[event.action];
  if (!label) throw new Error('Unknown driver status action');
  const name=d.name || [d.first_name,d.last_name].filter(Boolean).join(' ') || 'Unknown driver';
  const heading=`${name} — ${label}`;
  const subject=`${event.is_test ? '[TEST] ' : ''}${heading}`;
  const weeks=weeklySummary(orders,event.driver_id,event.occurred_at);
  const worked=tenure(d,event.occurred_at,event.action);
  const company=d.company || 'Unknown — company is not recorded';
  const notice=event.new_notice_date || event.old_notice_date;
  const detail=[`Company: ${company}`,`Time worked for us: ${worked}`,`Status changed: ${new Date(event.occurred_at).toLocaleString('en-US',{timeZone:'America/Chicago'})} (Chicago)`,...(event.actor_name?[`Changed by: ${event.actor_name}`]:[]),...(notice?[`2-week notice last day: ${notice}`]:[])];
  const disclaimer='Last 3 payroll weeks (Tuesday–Monday), including the current week to date. Freight amount = driver pay with driver additions and deductions. RPM = Freight amount ÷ miles. Team load amounts are shown once for each driver, as in Trips.';
  const test=event.is_test ? 'TEST ONLY — simulated status event; no driver status was changed.' : '';
  const rows=weeks.map((w,i)=>`<tr><td style="padding:10px;border-bottom:1px solid #ddd">${w.start} – ${w.end}${i===0?' (to date)':''}</td><td>${money(w.freight)}</td><td>${w.miles.toLocaleString('en-US')}</td><td>${w.miles ? money(w.rpm) : 'N/A'}</td></tr>`).join('');
  const html=`<div style="font-family:Arial,sans-serif;max-width:760px;margin:auto;color:#172033"><h2>${escape(heading)}</h2>${test?`<p style="padding:12px;background:#fff3cd">${test}</p>`:''}${detail.map(d=>`<p>${escape(d)}</p>`).join('')}<h3>Last 3 weeks</h3><table style="width:100%;border-collapse:collapse;text-align:left"><thead><tr style="background:#edf2f7"><th>Week</th><th>Freight amount</th><th>Miles</th><th>RPM</th></tr></thead><tbody>${rows}</tbody></table><p style="font-size:12px;color:#556">${disclaimer}</p></div>`;
  const text=[heading,test,...detail,'',disclaimer,...weeks.map((w,i)=>`${w.start} – ${w.end}${i===0?' (to date)':''}: Freight amount ${money(w.freight)} | Miles ${w.miles} | RPM ${w.miles?money(w.rpm):'N/A'}`)].filter(Boolean).join('\n');
  return {from:'Beverly TMS <statements@beverlyfreight.net>',to:['jon@bfprime.net'],subject,html,text};
}
