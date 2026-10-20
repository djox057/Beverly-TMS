/** Afterhours shifts are scheduled in Serbia local time, including DST. */
export const AFTERHOURS_SHIFT_TIME_ZONE = 'Europe/Belgrade';

export function getAfterhoursShiftTime(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: AFTERHOURS_SHIFT_TIME_ZONE,
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
  }).formatToParts(now);
  const part = (type: string) => parts.find(p => p.type === type)!.value;
  const today = `${part('year')}-${part('month')}-${part('day')}`;
  const hour = Number(part('hour'));
  const previousDay = new Date(`${today}T12:00:00Z`);
  previousDay.setUTCDate(previousDay.getUTCDate() - 1);
  const yesterday = previousDay.toISOString().slice(0, 10);
  const shift = hour >= 22 || hour < 6 ? 'night' : hour < 14 ? 'morning' : null;
  return { today, yesterday, shift, scheduledDate: hour < 6 ? yesterday : today };
}
