import { getOilChangeThresholds } from "@/pages/Reports/helpers";
import { chicagoTodayISO } from "@/lib/mileageUpdateStatus";

export const entryTypes = ["Mileage Check", "Oil Change", "Air Filter", "Air Filter + Oil change", "Baseline Start"] as const;
export type EntryType = typeof entryTypes[number];
export type ServiceEntry = {
  id: string; source_key: string | null; log_date: string | null; entry_type: EntryType;
  odometer: number | null; oil_spec: string | null; facility: string | null;
  invoice: string | null; notes: string | null; created_at: string; created_by?: string | null; imported?: boolean; current_reading?: boolean; original_odometer?: number | null; is_deleted?: boolean;
};
export type ServiceTruck = {
  start_miles?: number | null; baseline_start_date?: string | null; baseline_note?: string | null; oil_spec?: string | null; baseline_created_by?: string | null;
  id: string; truck_number: string; source: string | null; make: string | null;
  model: string | null; year: number | null; vin: string | null; engine: string | null;
  is_active: boolean; miles: number | null; miles_updated_at: string | null;
  last_oil_change_miles: number | null; oil_change_date: string | null;
  air_filter: number | null; last_oc_invoice: string | null; oil_change_note: string | null;
  samsara_account: string | null; dispatcher_id: string | null; driver1_id: string | null;
};
export const isOilService = (type: EntryType) => type === "Oil Change" || type === "Air Filter + Oil change";
export const isFilterService = (type: EntryType) => type === "Air Filter" || type === "Air Filter + Oil change";
export const getServiceInterval = (source: string | null) => {
  const normalized = (source ?? "").trim().toUpperCase();
  if (["M&K", "MK", "M & K"].includes(normalized)) return { miles: 40000 };
  if (normalized === "RYDER") return { miles: 50000 };
  if (normalized === "TEL") return { miles: 30000 };
  return { miles: 30000 };
};
export const mileageTone = (miles: number | null, source: string | null) => {
  if (miles == null || miles < 0) return "unknown";
  const thresholds = getOilChangeThresholds(source);
  return miles > thresholds.red ? "red" : miles > thresholds.yellow ? "yellow" : "good";
};

// Local cell edits override the display by stable source key, never the original live readings.
export function buildServiceEntries(truck: ServiceTruck, history: Array<{ id: string; field: string; old_value?: number | null; new_value: number | null; changed_at: string; changed_by?: string | null }>, saved: ServiceEntry[]) {
  const overrides = new Map(saved.filter(e => e.source_key).map(e => [e.source_key, e]));
  const mileageHistory = history.filter(e => e.field === "miles" && e.new_value != null);
  const chronological = [...mileageHistory].sort((a, b) => Date.parse(a.changed_at) - Date.parse(b.changed_at));
  const superseded = new Set<string>();
  // Rapid partial input can be audited before its full corrected value.
  // Omit only an unedited numeric prefix that drops below the previous
  // reading and is corrected by the same author within a minute.
  for (let i = 1; i < chronological.length - 1; i++) {
    const [previous, partial, corrected] = chronological.slice(i - 1, i + 2);
    // When both audit values are available, require their explicit links below.
    if (partial.old_value != null && corrected.old_value != null) continue;
    const previousMiles = Number(previous.new_value), partialMiles = Number(partial.new_value), correctedMiles = Number(corrected.new_value);
    const elapsed = Date.parse(corrected.changed_at) - Date.parse(partial.changed_at);
    const endpointEdited = [previous, corrected].some(e => {
      const extra = overrides.get(`history:${e.id}`);
      return extra && (extra.is_deleted || extra.entry_type !== "Mileage Check"
        || extra.odometer !== Number(e.new_value) || extra.log_date !== e.changed_at.slice(0, 10));
    });
    if (partialMiles > 0 && partialMiles < previousMiles && correctedMiles >= previousMiles
      && correctedMiles >= partialMiles * 10 && String(correctedMiles).startsWith(String(partialMiles))
      && partial.changed_by && partial.changed_by === corrected.changed_by
      && partial.changed_at.slice(0, 10) === corrected.changed_at.slice(0, 10) && elapsed >= 0 && elapsed <= 60000
      && !overrides.has(`history:${partial.id}`) && !endpointEdited) superseded.add(partial.id);
  }
  // Audited old/new links also establish the baseline for the first update
  // and multi-step corrections. Keep every value within the restored range.
  for (let i = 0; i < chronological.length;) {
    const start = chronological[i];
    let end = i;
    while (end + 1 < chronological.length) {
      const current = chronological[end], next = chronological[end + 1];
      const elapsed = Date.parse(next.changed_at) - Date.parse(start.changed_at);
      if (!start.changed_by || next.changed_by !== start.changed_by
        || next.changed_at.slice(0, 10) !== start.changed_at.slice(0, 10) || elapsed < 0 || elapsed > 60000
        || next.old_value == null || Number(next.old_value) !== Number(current.new_value)) break;
      end++;
    }
    const corrected = chronological[end];
    const baseline = start.old_value == null ? null : Number(start.old_value), finalMiles = Number(corrected.new_value);
    const endpointEdited = [corrected, ...(i > 0 ? [chronological[i - 1]] : [])].some(e => {
      const extra = overrides.get(`history:${e.id}`);
      return extra && (extra.is_deleted || extra.entry_type !== "Mileage Check"
        || extra.odometer !== Number(e.new_value) || extra.log_date !== e.changed_at.slice(0, 10));
    });
    if (end > i && baseline != null && baseline >= 0 && finalMiles >= baseline && !endpointEdited) {
      for (const e of chronological.slice(i, end)) {
        const miles = Number(e.new_value);
        if ((miles < baseline || miles > finalMiles) && !overrides.has(`history:${e.id}`)) superseded.add(e.id);
      }
    }
    i = end + 1;
  }
  const automatic: ServiceEntry[] = mileageHistory.filter(e => !superseded.has(e.id)).map(e => ({
    id: `history:${e.id}`, source_key: `history:${e.id}`, log_date: e.changed_at.slice(0, 10),
    entry_type: "Mileage Check", odometer: Number(e.new_value), oil_spec: null, facility: null,
    invoice: null, notes: null, created_at: e.changed_at, created_by: e.changed_by, imported: true, original_odometer: e.new_value, current_reading: e.field === "miles" && e.new_value === truck.miles && e.changed_at === truck.miles_updated_at,
  }));
  const filterHistory = history.filter(e => e.field === "air_filter" && e.new_value != null);
  automatic.push(...filterHistory.map(e => ({
    id: `history:${e.id}`, source_key: `history:${e.id}`, log_date: e.changed_at.slice(0, 10),
    entry_type: "Air Filter" as const, odometer: Number(e.new_value), oil_spec: null, facility: null,
    invoice: null, notes: null, created_at: e.changed_at, created_by: e.changed_by, imported: true,
  })));
  const author = (field: string, value: number | null) => history.filter(e => e.field === field && e.new_value === value).slice(-1)[0]?.changed_by ?? null;
  if (truck.start_miles != null || truck.baseline_start_date || truck.baseline_note) automatic.push({
    id: "truck:baseline", source_key: "truck:baseline", log_date: truck.baseline_start_date ?? null,
    entry_type: "Baseline Start", odometer: truck.start_miles ?? null, notes: truck.baseline_note ?? null,
    oil_spec: null, facility: null, invoice: null, created_at: "", created_by: truck.baseline_created_by, imported: true,
  });
  if (truck.miles != null && !automatic.some(e => e.entry_type === "Mileage Check" && e.odometer === truck.miles && e.log_date === truck.miles_updated_at?.slice(0, 10))) {
    const key = `live:mileage:${truck.miles_updated_at ?? "undated"}:${truck.miles}`;
    automatic.push({ id: key, source_key: key, log_date: truck.miles_updated_at?.slice(0, 10) ?? null,
      entry_type: "Mileage Check", odometer: truck.miles, oil_spec: null, facility: null, invoice: null,
      notes: null, created_at: truck.miles_updated_at ?? "", created_by: author("miles", truck.miles), imported: true, current_reading: true, original_odometer: truck.miles });
  }
  if (truck.last_oil_change_miles != null || truck.oil_change_date) automatic.push({
    id: `live:oil:${truck.oil_change_date ?? "undated"}:${truck.last_oil_change_miles}`, source_key: `live:oil:${truck.oil_change_date ?? "undated"}:${truck.last_oil_change_miles}`, log_date: truck.oil_change_date,
    entry_type: "Oil Change", odometer: truck.last_oil_change_miles, oil_spec: null, facility: null,
    invoice: truck.last_oc_invoice, notes: truck.oil_change_note, created_at: "", created_by: author("last_oil_change_miles", truck.last_oil_change_miles), imported: true,
  });
  if (truck.air_filter != null && !filterHistory.some(e => Number(e.new_value) === truck.air_filter)) automatic.push({ id: `live:filter:${truck.air_filter}`, source_key: `live:filter:${truck.air_filter}`, log_date: null,
    entry_type: "Air Filter", odometer: truck.air_filter, oil_spec: null, facility: null, invoice: null,
    notes: null, created_at: "", created_by: author("air_filter", truck.air_filter), imported: true });
  return [...automatic.map(e => {
    const extra = overrides.get(e.source_key!);
    return extra ? { ...e, ...extra, ...(e.source_key === "truck:baseline" ? { odometer: e.odometer, log_date: e.log_date, notes: e.notes, entry_type: e.entry_type } : {}), id: e.id, created_by: e.created_by, imported: true } : e;
  }), ...saved.filter(e => !e.source_key || !automatic.some(a => a.source_key === e.source_key)).map(e => ({ ...e, created_by: e.source_key ? null : e.created_by, imported: !!e.source_key }))].filter(e => !e.is_deleted).sort((a, b) => {
    // Dates take priority; for the same date an earlier odometer comes first.
    if (!a.log_date || !b.log_date) return a.log_date ? -1 : b.log_date ? 1 : 0;
    return a.log_date.localeCompare(b.log_date) || (a.odometer ?? 0) - (b.odometer ?? 0) || a.created_at.localeCompare(b.created_at);
  });
}

export function calculateServiceLog(entries: ServiceEntry[], source: string | null) {
  const interval = getServiceInterval(source);
  let oil: number | null = null;
  let filter: number | null = null;
  let baseline: number | null = null;
  return entries.map(entry => {
    const isBaseline = entry.entry_type === "Baseline Start";
    // Undated services are displayed, but cannot reset a historical dated reading.
    if (entry.log_date && entry.odometer != null) {
      if (isBaseline) baseline = entry.odometer;
      if (isOilService(entry.entry_type)) oil = entry.odometer;
      if (isFilterService(entry.entry_type)) filter = entry.odometer;
    }
    const reference = oil ?? baseline;
    return { ...entry,
      miles_since_service: entry.odometer == null ? null : isOilService(entry.entry_type) || isBaseline ? 0 : reference == null ? null : entry.odometer - reference,
      miles_since_filter: entry.odometer == null || filter == null ? null : entry.odometer - filter,
      next_due: entry.odometer == null ? null : isOilService(entry.entry_type) ? entry.odometer + interval.miles : isFilterService(entry.entry_type) ? entry.odometer + 80000 : null,
    };
  });
}

export function serviceSummary(truck: ServiceTruck, entries: ServiceEntry[], today = chicagoTodayISO()) {
  const interval = getServiceInterval(truck.source);
  const dated = entries.filter(e => e.log_date && e.log_date <= today);
  const datedOil = dated.filter(e => isOilService(e.entry_type)).slice(-1)[0];
  const undatedOil = entries.filter(e => isOilService(e.entry_type) && !e.log_date).slice(-1)[0];
  // A missing live date must not let older imported service mileage take over.
  const latestOil = undatedOil?.odometer != null
    && (datedOil?.odometer == null || undatedOil.odometer >= datedOil.odometer)
    ? undatedOil : datedOil ?? undatedOil;
  const datedFilter = dated.filter(e => isFilterService(e.entry_type)).slice(-1)[0];
  const undatedFilter = entries.filter(e => isFilterService(e.entry_type) && !e.log_date).slice(-1)[0];
  // A newer live filter reading can lack a service date. Older imported
  // services must not replace it merely because their dates are known.
  const latestFilter = undatedFilter?.odometer != null
    && (datedFilter?.odometer == null || undatedFilter.odometer >= datedFilter.odometer)
    ? undatedFilter : datedFilter ?? undatedFilter;
  const baseline = truck.start_miles != null || truck.baseline_start_date || truck.baseline_note
    ? { odometer: truck.start_miles ?? null, log_date: truck.baseline_start_date ?? null, notes: truck.baseline_note ?? null }
    : dated.filter(e => e.entry_type === "Baseline Start").slice(-1)[0];
  const readings = dated.filter(e => e.odometer != null && e.entry_type === "Mileage Check");
  const currentReading = readings.slice(-1)[0];
  const linkedCurrent = entries.find(e => e.current_reading && e.original_odometer === truck.miles);
  const liveCurrent = linkedCurrent ? linkedCurrent.odometer : truck.miles;
  const useLoggedReading = currentReading && (truck.miles_updated_at
    ? currentReading.log_date! > truck.miles_updated_at.slice(0, 10) || (currentReading.log_date === truck.miles_updated_at.slice(0, 10) && currentReading.created_at > truck.miles_updated_at)
    : liveCurrent == null || currentReading.odometer! > liveCurrent);
  const current = useLoggedReading ? currentReading.odometer : linkedCurrent ? linkedCurrent.odometer : truck.miles;
  const currentDate = useLoggedReading ? currentReading.log_date : linkedCurrent ? linkedCurrent.log_date : truck.miles_updated_at?.slice(0, 10) ?? null;
  const oilMiles = latestOil ? latestOil.odometer : (entries.some(e => e.source_key?.startsWith("live:oil:")) ? baseline?.odometer ?? null : truck.last_oil_change_miles ?? baseline?.odometer ?? null);
  const oilDate = latestOil ? latestOil.log_date : (entries.some(e => e.source_key?.startsWith("live:oil:")) ? baseline?.log_date ?? null : truck.oil_change_date ?? baseline?.log_date ?? null);
  const filterMiles = latestFilter ? latestFilter.odometer : entries.some(e => e.source_key?.startsWith("live:filter:")) ? null : truck.air_filter;
  const sinceOil = current == null || oilMiles == null ? null : current - oilMiles;
  const sinceFilter = current == null || filterMiles == null ? null : current - filterMiles;
  const nextDue = oilMiles == null ? null : oilMiles + interval.miles;
  const remaining = current == null || nextDue == null ? null : nextDue - current;
  const tone = mileageTone(sinceOil, truck.source);
  const invalid = (sinceOil != null && sinceOil < 0) || (sinceFilter != null && sinceFilter < 0);
  const overdue = (remaining != null && remaining < 0) || (sinceFilter != null && sinceFilter > 80000);
  const due = remaining === 0 || sinceFilter === 80000;
  const status = invalid ? "CHECK ODOMETER" : overdue ? "SERVICE OVERDUE" : due ? "SERVICE DUE" : tone === "red" || tone === "yellow" || (sinceFilter != null && sinceFilter > 60000) ? "DUE SOON" : sinceOil == null || oilDate == null ? "MISSING SERVICE DATA" : "READY / GOOD";
  return { interval, current, currentDate, sinceOil, sinceFilter, oilDate, nextDue, remaining, status, baseline, tone };
}
