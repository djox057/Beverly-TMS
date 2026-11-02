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
  const home=[d.home_city,d.home_state].filter(Boolean).join(', ') || 'Not recorded';
  const detail=[['Company',company],['Phone',d.phone || 'Not recorded'],['Email',d.email || 'Not recorded'],['Home city / state',home],['Time worked for us',worked],['Status changed',`${new Date(event.occurred_at).toLocaleString('en-US',{timeZone:'America/Chicago'})} (Chicago)`],...(notice?[['2-week notice last day',notice]]:[])];
  const disclaimer='Last 3 payroll weeks (Tuesday–Monday), including the current week to date. Freight amount = driver pay with driver additions and deductions. RPM = Freight amount ÷ miles. Team load amounts are shown once for each driver, as in Trips.';
  const test=event.is_test ? 'TEST ONLY — simulated status event; no driver status was changed.' : '';
  const shortDate=(v:string)=>new Date(`${v}T12:00:00Z`).toLocaleDateString('en-US',{month:'short',day:'numeric',year:'numeric',timeZone:'UTC'});
  const cell='padding:16px 18px;border-bottom:1px solid #e5eaf1;';
  const rows=weeks.map((w,i)=>`<tr style="background:${i===0?'#eff6ff':i%2?'#ffffff':'#f8fafc'}"><td style="${cell}white-space:nowrap"><div style="font-size:13px;font-weight:600;color:#1e293b">${shortDate(w.start)} – ${shortDate(w.end)}</div><div style="font-size:11px;color:${i===0?'#2563eb':'#64748b'};margin-top:5px">${i===0?'CURRENT WEEK · TO DATE':'COMPLETED WEEK'}</div></td><td align="right" style="${cell}font-weight:700;color:#0f172a;font-size:15px;white-space:nowrap">${money(w.freight)}</td><td align="right" style="${cell}color:#334155;font-size:14px">${w.miles.toLocaleString('en-US')}</td><td align="right" style="${cell}font-weight:600;color:#1d4ed8;font-size:14px;white-space:nowrap">${w.miles ? money(w.rpm) : 'N/A'}</td></tr>`).join('');
  const total=weeks.reduce((a,w)=>({freight:a.freight+w.freight,miles:a.miles+w.miles}),{freight:0,miles:0});
  const totals=`<tr style="background:#e2e8f0"><td style="${cell}font-weight:700;font-size:13px">3-WEEK TOTAL</td><td align="right" style="${cell}font-weight:700;font-size:15px;white-space:nowrap">${money(total.freight)}</td><td align="right" style="${cell}font-weight:700;font-size:14px">${total.miles.toLocaleString('en-US')}</td><td align="right" style="${cell}font-weight:700;font-size:14px;color:#1d4ed8;white-space:nowrap">${total.miles?money(total.freight/total.miles):'N/A'}</td></tr>`;
  const head=(label:string,align='right')=>`<th align="${align}" scope="col" style="padding:13px 18px;font-size:11px;letter-spacing:.6px;text-transform:uppercase;color:#e2e8f0;font-weight:600">${label}</th>`;
  const html=`<!doctype html><html><body style="margin:0;padding:24px 12px;background:#f1f5f9"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="font-family:Arial,sans-serif;color:#172033"><tr><td align="center"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:760px;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden"><tr><td style="background:#0f172a;padding:26px 28px"><div style="font-size:11px;letter-spacing:2px;color:#93c5fd;font-weight:700">BEVERLY TMS · DRIVER UPDATE</div><h1 style="font-size:23px;line-height:1.4;color:#ffffff;margin:12px 0 0">${escape(name)}</h1><div style="font-size:15px;color:#cbd5e1;margin-top:6px">${escape(label)}</div></td></tr><tr><td style="padding:24px 28px">${test?`<div style="padding:12px 14px;border:1px solid #fde68a;border-radius:6px;background:#fffbeb;font-size:12px;color:#92400e;margin-bottom:20px">${test}</div>`:''}<table role="presentation" width="100%" cellspacing="0" cellpadding="0">${detail.map(([label,value])=>`<tr><td valign="top" style="padding:7px 16px 7px 0;width:150px;font-size:12px;color:#64748b">${escape(label)}</td><td style="padding:7px 0;font-size:13px;line-height:1.5;color:#1e293b;font-weight:500;word-break:break-word">${escape(value)}</td></tr>`).join('')}</table><h2 style="font-size:18px;margin:28px 0 6px;color:#0f172a">Last 3 weeks</h2><p style="font-size:12px;color:#64748b;margin:0 0 16px">Tuesday–Monday payroll weeks · Current week included to date</p><table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:separate;border-spacing:0;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden"><thead><tr style="background:#1e293b">${head('Week','left')}${head('Freight amount')}${head('Miles')}${head('RPM')}</tr></thead><tbody>${rows}${totals}</tbody></table><p style="font-size:11px;line-height:1.7;color:#64748b;margin:16px 0 0">${disclaimer}</p></td></tr></table></td></tr></table></body></html>`;
  const text=[heading,test,...detail.map(([label,value])=>`${label}: ${value}`),'',disclaimer,...weeks.map((w,i)=>`${w.start} – ${w.end}${i===0?' (to date)':''}: Freight amount ${money(w.freight)} | Miles ${w.miles} | RPM ${w.miles?money(w.rpm):'N/A'}`),`3-week total: Freight amount ${money(total.freight)} | Miles ${total.miles} | RPM ${total.miles?money(total.freight/total.miles):'N/A'}`].filter(Boolean).join('\n');
  return {from:'Beverly TMS <jon@bfprime.net>',to:['ugo@pointxinc.com'],subject,html,text};
}
