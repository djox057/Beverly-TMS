import { getAfterhoursShiftTime } from '../_shared/afterhours-shift-time.ts';
export const HOS_MAX_AGE_MINUTES = 20;
export const GPS_MAX_AGE_MINUTES = 30;
export function fresh(value: unknown, now: number, minutes: number): boolean {
  if (typeof value !== 'string') return false;
  const time = Date.parse(value);
  return Number.isFinite(time) && time <= now && now - time <= minutes * 60000;
}
export function lowDrive(state: any, truckId: string, now: number): boolean {
  return state?.truck_id === truckId && typeof state.drive_minutes === 'number' &&
    state.drive_minutes >= 0 && state.drive_minutes <= 60 &&
    fresh(state.observed_at, now, HOS_MAX_AGE_MINUTES) && fresh(state.source_at, now, HOS_MAX_AGE_MINUTES);
}
export function coverageWindow(now: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {timeZone:'America/Chicago',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(now);
  const p = (type: string) => parts.find(p => p.type === type)!.value;
  return { chicagoDate: `${p('year')}-${p('month')}-${p('day')}`, ...getAfterhoursShiftTime(now) };
}
export function coveringUser(driverId: string, weekend: any[], shifts: any[], window: ReturnType<typeof coverageWindow>): string | null {
  // Same precedence as Reports: active shift overrides weekend coverage.
  const shift = window.shift ? shifts.filter(r => r.driver_id === driverId && r.scheduled_date === window.scheduledDate && r.shift === window.shift) : [];
  const matches = shift.length ? shift : weekend.filter(r => r.driver_id === driverId && r.scheduled_date === window.chicagoDate);
  const ids = [...new Set(matches.map(r => r.afterhours_user_id).filter(Boolean))];
  if (ids.length > 1) throw new Error('Conflicting coverage assignments; recipient needs review.');
  return ids[0] as string || null;
}
export function deliveryTarget(order: any): any | null {
  if (order.canceled || ['delivered','completed','canceled'].includes(order.status)) return null;
  const files = order.order_files || [];
  if (files.some((f: any) => f.file_category === 'POD')) return null;
  const stops = [...(order.pickup_drops || [])].sort((a,b) => (a.sequence_number ?? 0)-(b.sequence_number ?? 0));
  // Only freight already picked up. Never alert about distance to pickup/prebook.
  const pickups = stops.filter(s => s.type === 'pickup');
  if (!pickups.length || (!files.some((f: any) => f.file_category === 'BOL') && !pickups.every(s => s.checked_out_at))) return null;
  // Do not jump over an unfinished intermediate pickup.
  if (pickups.length > 1 && !pickups.every(s => s.checked_out_at)) return null;
  const next = stops.find(s => !s.checked_out_at && !(s.type === 'pickup' && pickups.length === 1 && files.some((f: any) => f.file_category === 'BOL')));
  return next?.type === 'delivery' && !next.arrived_at ? next : null;
}
export function estimatedRoadMiles(gps: any, stop: any): number | null {
  const valid = (lat: unknown, lon: unknown) => typeof lat === 'number' && typeof lon === 'number' && Number.isFinite(lat) && Number.isFinite(lon) && lat >= 24 && lat <= 50 && lon >= -125.5 && lon <= -65;
  const lat = stop.latitude == null ? NaN : Number(stop.latitude), lon = stop.longitude == null ? NaN : Number(stop.longitude);
  if (!valid(gps.latitude,gps.longitude) || !valid(lat,lon)) return null;
  const rad = (n: number) => n*Math.PI/180;
  const a = Math.sin(rad(lat-gps.latitude)/2)**2 + Math.cos(rad(gps.latitude))*Math.cos(rad(lat))*Math.sin(rad(lon-gps.longitude)/2)**2;
  // Existing TMS distance method, without rounding at the 40-mile threshold.
  return 3959*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a))*1.3;
}
