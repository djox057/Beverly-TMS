/** Appointments are stored as local wall times; never convert their UTC suffix. */
export function formatHosStopWindow(start?: string | null, end?: string | null): string {
  const parts = (value?: string | null) => {
    const match = value?.match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}:\d{2})/);
    return match ? { date: `${match[2]}/${match[3]}/${match[1]}`, time: match[4] } : null;
  };
  const from = parts(start), to = parts(end);
  if (!from) return to ? `${to.date} ${to.time}` : 'Not set';
  if (!to || (from.date === to.date && from.time === to.time)) return `${from.date} ${from.time}`;
  return `${from.date} ${from.time}-${to.date === from.date ? '' : `${to.date} `}${to.time}`;
}
