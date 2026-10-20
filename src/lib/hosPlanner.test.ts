// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { assessHos, wallTime, addDays, logDate, hosStopMinutes, type HosPlanInput } from '../../supabase/functions/_shared/hos-planner';
const now=Date.parse('2026-10-19T13:00:00Z'); // 08:00 Chicago
const at=(value:string)=>wallTime(value,'America/Chicago');
const fixture=(overrides:Partial<HosPlanInput>={}):HosPlanInput=>({now,clock:{drive:660,shift:840,break:480,cycle:3000,updatedAt:new Date(now).toISOString(),sourceAt:new Date(now).toISOString(),status:'ON'},days:[],legs:[
  {label:'Pickup',miles:55,start:at('2026-10-19T10:00:00'),end:at('2026-10-19T12:00:00')},
  {label:'Delivery',miles:110,start:at('2026-10-19T16:00:00'),end:at('2026-10-19T18:00:00')},
],...overrides});
describe('HOS load forecasts',()=>{
  it('uses two hours for each single-load stop and one hour for each multi-load stop',()=>{
    expect(hosStopMinutes([{type:'pickup'},{type:'delivery'}])).toBe(120);
    expect(hosStopMinutes([{type:'pickup'},{type:'delivery'},{type:'delivery'}])).toBe(60);
    expect(hosStopMinutes([{type:'pickup'},{type:'pickup'},{type:'delivery'}])).toBe(60);
    const input=fixture();
    input.legs=[{label:'Pickup',miles:0,start:now,end:now+60*60000},
      {label:'Delivery',miles:55,start:now,end:now+300*60000}];
    expect(assessHos(input).cycleRemainingMinutes).toBe(2700);
    input.legs.splice(1,0,{label:'Pickup 2',miles:0,start:now,end:now+180*60000});
    expect(assessHos(input).cycleRemainingMinutes).toBe(2760);
  });
  it.each([1,29,30])('keeps %i minutes late yellow and explains the lateness',late=>{
    const input=fixture();
    input.legs=[{label:'Pickup',miles:0,start:now,end:now+60*60000},
      {label:'Delivery',miles:55,start:now,end:now+(180-late)*60000}];
    const result=assessHos(input);
    expect(result.color).toBe('yellow');
    expect(result.bufferMinutes).toBe(-late);
    expect(result.summary).toContain('late');
  });
  it('turns red at 31 minutes late',()=>{
    const input=fixture();
    input.legs=[{label:'Pickup',miles:0,start:now,end:now+60*60000},
      {label:'Delivery',miles:55,start:now,end:now+149*60000}];
    expect(assessHos(input).color).toBe('red');
  });
  it('shows green for a comfortable same-day load',()=>expect(assessHos(fixture()).color).toBe('green'));
  it('shows yellow for missing/stale data and unassigned prebooks',()=>{
    expect(assessHos(fixture({clock:null})).color).toBe('yellow');
    const input=fixture();input.clock!.sourceAt='2026-10-18T13:00:00Z';
    expect(assessHos(input).color).toBe('yellow');
  });
  it('does not add the shared clock twice for teams',()=>expect(assessHos(fixture({team:true})).color).toBe('yellow'));
  it('detects impossible pickup even with optimistic future recaps',()=>{
    const input=fixture();input.legs[0].miles=550;input.legs[0].end=at('2026-10-19T10:00:00');
    expect(assessHos(input).color).toBe('red');
  });
  it('resets daily clocks overnight while preserving cycle',()=>{
    const input=fixture();Object.assign(input.clock!,{drive:0,shift:0,break:0,cycle:1200});
    input.legs=[{label:'Pickup',miles:55,start:at('2026-10-20T08:00:00'),end:at('2026-10-20T10:00:00')},
      {label:'Delivery',miles:275,start:at('2026-10-20T16:00:00'),end:at('2026-10-20T18:00:00')}];
    const result=assessHos(input);expect(result.color).toBe('green');expect(result.cycleRemainingMinutes).toBeLessThan(1200);
  });
  it('finishes a long trip after a 10-hour rest instead of requiring same-day delivery',()=>{
    const input=fixture();input.clock!.drive=180;
    input.legs=[{label:'Pickup',miles:0,start:now,end:now+2*3600000},
      {label:'Delivery',miles:440,start:at('2026-10-20T06:00:00'),end:at('2026-10-20T08:00:00')}];
    // 08–10 loading, 10–13 driving, 13–23 rest, 23–04 driving.
    // The driver waits until 06:00 and unloads for two hours.
    const result=assessHos(input);
    expect(result.color).toBe('green');
    expect(result.earliestArrival).toBe(new Date(at('2026-10-20T04:00:00')).toISOString());
    expect(result.cycleRemainingMinutes).toBe(2280); // 8h driving + 4h service.
    expect(result.reasons).toContain('1 qualifying 10-hour rest period(s) included.');
    input.legs[1].start=at('2026-10-20T01:00:00');
    input.legs[1].end=at('2026-10-20T02:00:00');
    expect(assessHos(input).color).toBe('red');
  });
  it('uses the correct expired day for tomorrow recap, not any convenient historical day',()=>{
    const input=fixture();input.clock!.cycle=60;
    input.legs=[{label:'Pickup',miles:0,start:at('2026-10-20T01:00:00'),end:at('2026-10-20T02:00:00')},
      {label:'Delivery',miles:220,start:at('2026-10-20T06:00:00'),end:at('2026-10-20T08:00:00')}];
    input.days=[{date:'2026-10-12',onDutyMinutes:600,observedMinutes:1440,missingMinutes:0}];
    const result=assessHos(input);expect(result.color).toBe('yellow');expect(result.recapMinutes).toBe(600);
    input.days=[{date:'2026-10-13',onDutyMinutes:600,observedMinutes:1440,missingMinutes:0},{date:'2026-10-12',onDutyMinutes:0,observedMinutes:1440,missingMinutes:0}];
    expect(assessHos(input).color).toBe('red');
  });
  it('does not declare a low-cycle future load red just because recap history is missing',()=>{
    const input=fixture();input.clock!.cycle=60;
    input.legs=[{label:'Pickup',miles:0,start:at('2026-10-20T01:00:00'),end:at('2026-10-20T02:00:00')},
      {label:'Delivery',miles:220,start:at('2026-10-20T06:00:00'),end:at('2026-10-20T08:00:00')}];
    expect(assessHos(input).color).toBe('yellow');
  });
  it('honors future restarts without crediting pre-restart history again',()=>{
    const input=fixture();input.clock!.cycle=0;
    input.legs=[{label:'Pickup',miles:55,start:at('2026-10-21T08:00:00'),end:at('2026-10-21T10:00:00')},
      {label:'Delivery',miles:220,start:at('2026-10-21T16:00:00'),end:at('2026-10-21T18:00:00')}];
    const result=assessHos(input);expect(result.color).toBe('green');expect(result.cycleRemainingMinutes).toBeLessThanOrEqual(4200);
  });
  it('counts loading time and the shift window, not only drive miles',()=>{
    const input=fixture();input.clock!.shift=180;
    input.legs=[{label:'Pickup',miles:55,start:at('2026-10-19T09:00:00'),end:at('2026-10-19T10:00:00'),serviceMinutes:180},
      {label:'Delivery',miles:110,start:at('2026-10-19T13:00:00'),end:at('2026-10-19T15:00:00')}];
    expect(assessHos(input).color).toBe('red');
  });
  it('includes assigned loads before the new pickup',()=>{
    const input=fixture();input.legs.unshift({label:'Existing delivery',miles:550,existing:true});
    expect(assessHos(input).color).toBe('red');
    input.uncertainties=['Remaining current-load miles are uncertain.'];
    input.legs[0].uncertain=true;
    expect(assessHos(input).color).toBe('yellow');
  });
  it('retains known future bookings in the best-case pass despite uncertain current work',()=>{
    const input=fixture();
    input.uncertainties=['Remaining current-load miles are uncertain.'];
    input.legs.unshift(
      {label:'Current delivery',miles:55,existing:true,uncertain:true},
      {label:'Already booked pickup',miles:0,start:at('2026-10-19T09:00:00'),end:at('2026-10-19T10:00:00'),existing:true},
      {label:'Already booked delivery',miles:550,start:at('2026-10-20T08:00:00'),end:at('2026-10-20T10:00:00'),existing:true},
    );
    expect(assessHos(input).color).toBe('red');
  });
  it('does not skip known bookings because a stop timezone or recap is uncertain',()=>{
    const input=fixture();
    input.uncertainties=['Stop timezone defaults to Chicago because coordinates are missing.'];
    input.legs.unshift({label:'Existing delivery',miles:550,existing:true});
    expect(assessHos(input).color).toBe('red');
  });
  it('keeps missing/malformed stop windows yellow',()=>{
    const input=fixture();input.legs[1].end=NaN;expect(assessHos(input).color).toBe('yellow');
  });
  it('uses real timezone offsets across DST and the Chicago log date',()=>{
    expect(at('2026-10-19T08:00:00')).toBe(now);
    expect(wallTime('2026-10-19T08:00:00','America/New_York')).toBe(now-3600000);
    expect(at('2026-11-02T00:00:00')-at('2026-11-01T00:00:00')).toBe(25*3600000);
    expect(logDate(Date.parse('2026-10-20T03:00:00Z'))).toBe('2026-10-19');
    expect(addDays('2026-10-20',-8)).toBe('2026-10-12');
  });
  it('inserts the 30-minute driving break instead of treating eight hours as a hard stop',()=>{
    const input=fixture();input.legs=[{label:'Pickup',miles:0,start:now,end:now+60*60000,serviceMinutes:60},
      {label:'Delivery',miles:550,start:now+12*3600000,end:now+14*3600000}];
    const result=assessHos(input);expect(result.color).toBe('green');
    expect(Date.parse(result.earliestArrival!)).toBe(now+11.5*3600000);
  });
});
