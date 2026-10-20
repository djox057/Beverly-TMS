/** Forecast only: standard US property-carrying 70/8, 55 mph, 120 min/stop
 * for one pickup/one delivery, otherwise 60 min/stop.
 * No split-sleeper/adverse-condition exemptions are assumed. Minute stepping
 * keeps recaps, restarts and DST log-day boundaries in chronological order.
 */
export interface HosClock {
  drive: number; shift: number; break: number; cycle: number;
  updatedAt: string; sourceAt?: string | null; status?: string | null;
  restStartedAt?: string | null;
}
export interface HosDay { date: string; onDutyMinutes: number; observedMinutes: number; missingMinutes: number }
export interface HosLeg {
  miles: number; start?: number; end?: number; label: string;
  serviceMinutes?: number; existing?: boolean; uncertain?: boolean;
}
export interface HosPlanInput {
  now: number; clock: HosClock | null; days: HosDay[]; legs: HosLeg[];
  timeZone?: string; team?: boolean; uncertainties?: string[];
}
export interface HosAssessment {
  color: 'green' | 'yellow' | 'red'; summary: string; reasons: string[];
  earliestArrival?: string; bufferMinutes?: number; cycleRemainingMinutes?: number;
  recapMinutes?: number; assessedAt: string;
}
const MINUTE = 60000;
const dateFormatters = new Map<string, Intl.DateTimeFormat>();
export const HOS_DEFAULTS = { timeZone: 'America/Chicago', mph: 55, stopMinutes: 60, bufferMinutes: 60 };
export function hosStopMinutes(stops: {type:string}[]) {
  return stops.length === 2 && stops.filter(stop=>stop.type==='pickup').length === 1
    && stops.filter(stop=>stop.type==='delivery').length === 1 ? 120 : 60;
}
export function logDate(time: number, timeZone = HOS_DEFAULTS.timeZone) {
  if (!dateFormatters.has(timeZone)) dateFormatters.set(timeZone,new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }));
  return dateFormatters.get(timeZone)!.format(time);
}
export function addDays(day: string, amount: number) {
  const d = new Date(`${day}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + amount); return d.toISOString().slice(0, 10);
}
/** Existing TMS timestamps are wall-clock appointment values, even when the DB
 * serializes them with +00. Resolve them using the stop's timezone, not the browser. */
export function wallTime(value: string, timeZone: string): number {
  const match = value.match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})(?::(\d{2}))?/);
  if (!match) return NaN;
  const wall = Date.parse(`${match[1]}T${match[2]}:${match[3] || '00'}Z`);
  let utc = wall;
  for (let i = 0; i < 4; i++) {
    const p = new Intl.DateTimeFormat('en-CA', { timeZone, year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit', hourCycle:'h23' }).formatToParts(utc);
    const v = Object.fromEntries(p.map(x => [x.type, x.value]));
    const shown = Date.parse(`${v.year}-${v.month}-${v.day}T${v.hour}:${v.minute}:${v.second}Z`);
    const next = utc + wall - shown;
    if (next === utc) break;
    utc = next;
  }
  return utc;
}
export const hours = (minutes: number) => `${Math.floor(Math.max(0, minutes) / 60)}h ${Math.round(Math.max(0, minutes) % 60)}m`;

function simulate(input: HosPlanInput, optimistic: boolean, extensions: number[] = []) {
  const zone = input.timeZone || HOS_DEFAULTS.timeZone;
  const c = input.clock!;
  let time = input.now, drive = Math.min(660, c.drive), shift = Math.min(840, c.shift);
  let breakLeft = Math.min(480, c.break), cycle = Math.min(4200, c.cycle);
  let rest = ['OFF','SB'].includes(c.status || '') && c.restStartedAt
    ? Math.max(0, (time - Date.parse(c.restStartedAt)) / MINUTE) : 0;
  let interruption = Math.min(rest, 30), restarted = rest >= 2040;
  let date = logDate(time, zone), minBuffer = Infinity, recaps = 0;
  let uncertainRecap = false, usedEstimatedRecap = false, dailyRestCount = 0;
  const daily = new Map(input.days.map(d => [d.date, d]));
  const futureDuty = new Map<string, number>();
  // A completed restart makes all older work ineligible for future recaps.
  let restartAt = restarted ? time - rest * MINUTE : -Infinity;
  const assumptions = new Set<string>();
  const lateStops: string[] = [];
  const restPoints: number[] = [];
  const restLegIndices: number[] = [];
  const arrivals: number[] = [];
  let extendedRest = 0;
  let waitingMinutes = 0, existingLate = false;
  const targetStopMinutes = input.legs.filter(leg=>!leg.existing).length === 2 ? 120 : 60;
  function tick(kind: 'drive' | 'on' | 'off', count: number) {
    for (let m = 0; m < Math.ceil(count); m++) {
      const previousDay = date;
      const oldTime = time;
      if (kind === 'drive' || kind === 'on') {
        futureDuty.set(date, (futureDuty.get(date) || 0) + 1);
        cycle--; shift--; rest = 0; restarted = false;
        if (kind === 'drive') { drive--; breakLeft--; interruption = 0; }
        else { interruption++; if (interruption >= 30) breakLeft = 480; }
      } else {
        rest++; interruption++; shift--;
        if (interruption >= 30) breakLeft = 480;
        if (rest >= 600) { drive = 660; shift = 840; breakLeft = 480; }
        if (rest >= 2040 && !restarted) { cycle = 4200; restarted = true; restartAt = oldTime - (rest - 1) * MINUTE; }
      }
      time += MINUTE;
      date = logDate(time, zone);
      if (date !== previousDay) {
        const expired = addDays(date, -8);
        const entry = daily.get(expired);
        const wasReset = logDate(restartAt === -Infinity ? 0 : restartAt, zone) >= expired && restartAt !== -Infinity;
        if (!wasReset) {
          let returned = 0;
          const dayMinutes = (wallTime(`${addDays(expired,1)}T00:00:00`,zone)-wallTime(`${expired}T00:00:00`,zone))/MINUTE;
          if (entry && entry.observedMinutes >= dayMinutes-15 && entry.missingMinutes <= 15) {
            returned += entry.onDutyMinutes;
            usedEstimatedRecap ||= returned > 0;
          } else if (expired < logDate(input.now, zone)) {
            // Missing history is never treated as a confirmed zero-work day.
            uncertainRecap = true;
            if (optimistic) returned = 1440;
          }
          returned += futureDuty.get(expired) || 0;
          cycle = Math.min(4200, cycle + returned); recaps += returned;
        }
      }
    }
  }
  // Honor an already-observed qualifying rest before the first movement.
  if (rest >= 600) { drive = 660; shift = 840; breakLeft = 480; }
  if (rest >= 2040) cycle = 4200;
  let failed: string | undefined, arrival = time;
  const horizon = input.now + 21 * 86400000;
  for (const [legIndex, leg] of input.legs.entries()) {
    // Unknown remaining work gets a best-case second pass before issuing red.
    if (optimistic && leg.existing && leg.uncertain) continue;
    let remaining = Math.ceil(leg.miles / HOS_DEFAULTS.mph * 60);
    while (remaining > 0 && time < horizon) {
      if (cycle < 1) {
        tick('off', 1); // Recap or 34h restart can reopen the cycle, whichever comes first.
        assumptions.add('Cycle recovery/rest is included in the forecast.');
      } else if (drive < 1 || shift < 1) {
        restPoints.push(time);
        restLegIndices.push(legIndex);
        const extra = extensions[dailyRestCount] || 0;
        tick('off', Math.max(1, 600 - rest) + extra); dailyRestCount++;
        extendedRest += extra;
      } else if (breakLeft < 1) {
        tick('off', 30);
      } else {
        tick('drive', 1); remaining--;
      }
    }
    if (time >= horizon) { failed = 'The load exceeds the 21-day planning horizon.'; break; }
    arrival = time;
    arrivals[legIndex] = arrival;
    if (leg.existing && Number.isFinite(leg.end) && arrival > leg.end! + 30*MINUTE) existingLate = true;
    if (!leg.existing && Number.isFinite(leg.end)) {
      const buffer = Math.floor((leg.end! - arrival) / MINUTE);
      minBuffer = Math.min(minBuffer, buffer);
      if (buffer < -30) { failed = `${leg.label} is reached ${hours(-buffer)} after its appointment window.`; break; }
      if (buffer < 0) lateStops.push(`${leg.label} is reached ${hours(-buffer)} after its appointment window (within the 30-minute yellow tolerance).`);
    }
    if (Number.isFinite(leg.start) && leg.start! > time) {
      waitingMinutes += (leg.start! - time) / MINUTE;
      tick('off', (leg.start! - time) / MINUTE);
    }
    tick('on', leg.serviceMinutes ?? (leg.existing ? HOS_DEFAULTS.stopMinutes : targetStopMinutes));
  }
  if (dailyRestCount) assumptions.add(`${dailyRestCount} qualifying 10-hour rest period(s) included.`);
  if (extendedRest) assumptions.add(`Includes ${hours(extendedRest)} of additional rest to preserve the shift for later appointments.`);
  if (existingLate) assumptions.add('An existing load is forecast late; confirm its actual progress and appointment window.');
  if (usedEstimatedRecap) assumptions.add(`Uses ${hours(recaps)} of estimated recap hours from observed duty history.`);
  return { failed, arrival, minBuffer, cycle, recaps, uncertainRecap, usedEstimatedRecap, restPoints, restLegIndices, arrivals, waitingMinutes, existingLate, assumptions: [...assumptions, ...lateStops] };
}

/** Earliest departure is not always the best schedule: it can spend the shift
 * waiting at a later pickup. Move that idle time into an earlier qualifying
 * rest, keeping preceding commitments within their windows. Search is bounded
 * and incomplete searches are advisory yellow rather than a confident red. */
function planRest(input: HosPlanInput, optimistic: boolean) {
  const baseline = simulate(input, optimistic);
  if (!baseline.failed || !baseline.restPoints.length || baseline.waitingMinutes<1) return {...baseline, searchLimited:false};
  const limits = input.legs.map((leg,i) => leg.existing && Number.isFinite(leg.end)
    ? Math.max(leg.end!, baseline.arrivals[i] ?? leg.end!) : Infinity);
  let best = baseline, bestExtensions: number[] = [], attempts = 0;
  // Two passes allow moving waiting time across more than one rest period.
  for (let pass=0; pass<2; pass++) {
    let improved = false;
    for (let point=0; point<best.restPoints.length; point++) {
      const legIndex=best.restLegIndices[point];
      const slack=limits[legIndex]-best.arrivals[legIndex];
      const maximum=Math.min(1440,Math.max(0,Math.floor(slack/MINUTE)+(bestExtensions[point]||0)));
      for (let extra=30; extra<=maximum; extra+=30) {
        if (++attempts>192) return {...best,searchLimited:true};
        const extensions = [...bestExtensions]; extensions[point]=extra;
        const candidate = simulate(input,optimistic,extensions);
        if (candidate.arrivals.some((arrival,i)=>arrival>limits[i])) continue;
        if (!candidate.failed) return {...candidate,searchLimited:false};
        if (candidate.arrival < best.arrival) {
          best=candidate; bestExtensions=extensions; improved=true;
        }
      }
    }
    if (!improved) break;
  }
  return {...best,searchLimited:true};
}

export function assessHos(input: HosPlanInput): HosAssessment {
  const base = { assessedAt: new Date(input.now).toISOString() };
  const yellow = (summary: string, reasons: string[] = []): HosAssessment => ({...base, color:'yellow', summary, reasons});
  if (!input.clock) return yellow('Select a driver to check HOS.');
  const c = input.clock;
  if ([c.drive,c.shift,c.break,c.cycle].some(v => !Number.isFinite(v) || v < 0)) return yellow('HOS clocks are incomplete.');
  const timestamp = Date.parse(c.sourceAt || c.updatedAt);
  if (!Number.isFinite(timestamp) || input.now - timestamp > 20 * MINUTE || timestamp > input.now + 5 * MINUTE) return yellow('HOS data is stale; refresh is needed.');
  if (input.team) return yellow('Team HOS requires individual driver clocks.', ['The current provider feed shares one truck clock between team drivers.']);
  const target = input.legs.filter(l => !l.existing);
  if (target.length < 2 || target.some(l => !Number.isFinite(l.miles) || l.miles < 0 || !Number.isFinite(l.start) || !Number.isFinite(l.end))) return yellow('Complete the stop windows and route miles to check HOS.');
  if (target.some(l => l.end! < l.start!) || target.some(l => l.start! > input.now + 21 * 86400000)) return yellow('Check the appointment windows; planning supports up to 21 days.');
  if (target[0].end! < input.now - 15 * MINUTE) return yellow('Historical load: current HOS cannot assess a past pickup.');
  const planned = planRest(input, false);
  const reasons = [`Current clocks: drive ${hours(c.drive)}, shift ${hours(c.shift)}, cycle ${hours(c.cycle)}.`,
    ...(input.uncertainties || []), ...planned.assumptions, `Estimated at 55 mph with ${target.length===2 ? 120 : 60} minutes per stop for this load; stop times use local time. Up to 30 minutes late is yellow.`];
  if (planned.failed) {
    const best = planRest(input, true);
    if (best.failed && best.searchLimited) return yellow('The rest schedule needs dispatcher review before confirming feasibility.', [...reasons, 'A bounded search of longer rest periods could not confirm a schedule.']);
    if (best.failed) return {...base, color:'red', summary:best.failed, reasons, earliestArrival:new Date(best.arrival).toISOString(), bufferMinutes:best.minBuffer};
    return yellow('Feasibility depends on unconfirmed recaps or remaining work.', [...reasons, 'More history is needed before confirming this schedule.']);
  }
  const uncertain = input.uncertainties?.length || planned.existingLate || planned.usedEstimatedRecap || (planned.uncertainRecap && planned.cycle < 60);
  const tight = planned.minBuffer < HOS_DEFAULTS.bufferMinutes || planned.cycle < 60;
  return {...base, color:uncertain || tight ? 'yellow' : 'green', summary:planned.minBuffer<0 ? `Schedule is ${hours(-planned.minBuffer)} late, within the 30-minute yellow tolerance.` : uncertain ? 'Schedule fits, with estimates to confirm.' : tight ? 'Schedule fits with a small HOS buffer.' : 'HOS friendly: schedule fits with a buffer.', reasons,
    earliestArrival:new Date(planned.arrival).toISOString(), bufferMinutes:Number.isFinite(planned.minBuffer) ? planned.minBuffer : undefined, cycleRemainingMinutes:Math.max(0,planned.cycle), recapMinutes:planned.recaps};
}
