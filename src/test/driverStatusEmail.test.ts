import { describe, expect, it } from 'vitest';
import { buildEmail, segments, tenure, weekStart, weeklySummary } from '../../supabase/functions/send-driver-status-email/report';
import { processEmails } from '../../supabase/functions/send-driver-status-email/worker';

const occurred='2026-11-02T22:00:00Z';
const order=(extra:Record<string,any>={})=>({id:'load',driver1_id:'driver',delivery_datetime:'2026-10-30T12:00:00Z',driver_price:1000,loaded_miles:400,dh_miles:90,additional_miles:10,...extra});
const event=(action='done')=>({id:'event',driver_id:'driver',driver_snapshot:{name:'Chris <Tafolla>',company:'AP Silver Trans LLC',hire_date:'2026-05-20',termination_date:'2026-11-02'},action,occurred_at:occurred,is_test:true});

describe('driver status emails',()=>{
  it('uses Tuesday weeks across DST and year boundaries',()=>{
    expect(weekStart('2026-11-02')).toBe('2026-10-27');
    expect(weekStart('2026-11-03')).toBe('2026-11-03');
    expect(weekStart('2027-01-01')).toBe('2026-12-29');
  });
  it('uses driver additions/deductions, all miles, and weighted RPM',()=>{
    const weeks=weeklySummary([order({detention_driver:200,lumper_driver:50,late_fee_driver:100,other_charges_driver:25,other_additionals_driver:75}),order({id:'other',driver_price:300,loaded_miles:100,dh_miles:0,additional_miles:0})],'driver',occurred);
    expect(weeks[0]).toMatchObject({start:'2026-10-27',freight:1500,miles:600,rpm:2.5,loads:2});
    expect(weeks[1].freight).toBe(0);
    expect(weeks[2].freight).toBe(0);
  });
  it('includes team driver 2 once, skips future and unpaid cancellations, includes TONU',()=>{
    const w=weeklySummary([order({driver2_id:'driver'}),order({id:'future',delivery_datetime:'2026-11-03T12:00:00Z'}),order({id:'cancel',canceled:true}),order({id:'tonu',canceled:true,driver_price:0,tonu_driver:150,loaded_miles:0,dh_miles:0,additional_miles:0})],'driver',occurred);
    expect(w[0]).toMatchObject({freight:1150,miles:500,loads:2});
    expect(weeklySummary([order({driver1_id:'other',driver2_id:'driver'})],'driver',occurred)[0].freight).toBe(1000);
  });
  it('honors week overrides, including loads originally outside the last 3 weeks',()=>{
    const w=weeklySummary([order({delivery_datetime:'2026-09-01T00:00:00Z',order_week_overrides:[{target_week_start:'2026-10-20'}]})],'driver',occurred);
    expect(w[1].freight).toBe(1000);
  });
  it('attributes multi-transfer pay and miles by segment without double counting',()=>{
    const o=order({is_recovery:true,original_driver1_id:'original',original_driver_price:200,original_miles:100,order_transfers:[{sequence_number:0,driver1_id:'wrong',driver_price:250,miles:125,transfer_datetime:'2026-10-21T12:00:00Z'},{sequence_number:1,driver1_id:'driver',driver_price:500,miles:200},{sequence_number:2,driver1_id:'last',driver_price:100,miles:75}]});
    expect(segments(o)).toHaveLength(3);
    expect(weeklySummary([o],'original',occurred)[1]).toMatchObject({freight:250,miles:125});
    expect(weeklySummary([o],'driver',occurred)[0]).toMatchObject({freight:500,miles:200});
    expect(segments({...o,is_recovery:false})).toHaveLength(1);
  });
  it('supports legacy recovery originals and current drivers',()=>{
    const o=order({is_recovery:true,original_driver1_id:'original',original_driver_price:200,original_miles:100,recovery_driver_price:800,recovery_miles:400});
    expect(weeklySummary([o],'original',occurred)[0].freight).toBe(200);
    expect(weeklySummary([o],'driver',occurred)[0].freight).toBe(800);
  });
  it('makes all four tests explicit and escapes driver names in HTML',()=>{
    for(const action of ['two_week_notice','done','two_week_cancelled','continued_driving']) {
      const email=buildEmail(event(action),[order()]);
      expect(email.to).toEqual(['jon@bfprime.net']);
      expect(email.subject).toContain('[TEST] Chris <Tafolla>');
      expect(email.html).toContain('Chris &lt;Tafolla&gt;');
      expect(email.text).toContain('no driver status was changed');
      expect(email.html).toContain('Freight amount');
    }
    expect(buildEmail(event(),[]).html).toContain('N/A');
  });
  it('does not invent hire dates and measures done tenure to termination',()=>{
    expect(tenure({},occurred,'done')).toContain('Unknown');
    expect(tenure({hire_date:'2027-01-01'},occurred,'done')).toContain('Unknown');
    expect(tenure({hire_date:'2026-10-01',termination_date:'2026-10-15'},occurred,'done')).toContain('14 days');
  });

  function mockDb(e:any) {
    let claimed=false;const updates:any[]=[];
    const db={rpc:async()=>({data:claimed?[]:(claimed=true,[e]),error:null}),from:()=>({update:(v:any)=>{
      updates.push(v);const q:any={eq:()=>q,then:(resolve:any)=>Promise.resolve({data:[],error:null}).then(resolve)};return q;
    }})};
    return {db,updates};
  }
  it('retries with the saved payload and a stable provider idempotency key',async()=>{
    const payload=buildEmail(event(),[order()]);
    const {db,updates}=mockDb({...event(),attempts:1,claim_token:'lease',email_payload:payload});
    const sent:any[]=[];
    const r=await processEmails(db,'test-key','event',async(_url,options)=>{sent.push(options);return Response.json({id:'provider-id'});});
    expect(r).toEqual({sent:1,failed:0});
    expect(sent[0].headers['Idempotency-Key']).toBe('driver-status-event');
    expect(JSON.parse(sent[0].body)).toEqual(payload);
    expect(updates[0].provider_message_id).toBe('provider-id');
  });
  it('records provider failures for retry without marking sent',async()=>{
    const {db,updates}=mockDb({...event(),attempts:2,claim_token:'lease',email_payload:buildEmail(event(),[])});
    expect(await processEmails(db,'test-key','event',async()=>new Response('',{status:429}))).toEqual({sent:0,failed:1});
    expect(updates[0].last_error).toContain('429');
    expect(updates[0].sent_at).toBeUndefined();
  });
});
