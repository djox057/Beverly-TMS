import { getOilChangeThresholds } from "@/pages/Reports/helpers";
import { getServiceInterval } from "@/lib/truckServiceLog";

type Truck = { dispatcher_id?: string | null; dispatcher_name?: string | null; fleet_pm_readiness?: string; source: string | null; miles: number | null; last_oil_change_miles: number | null; air_filter: number | null };
export type Status = "Good" | "Yellow" | "Due soon" | "Due" | "Overdue" | "Missing / invalid";
const statuses: Status[] = ["Good", "Yellow", "Due soon", "Due", "Overdue", "Missing / invalid"];
const tones = ["text-emerald-700 dark:text-emerald-400", "text-amber-700 dark:text-amber-400", "text-red-700 dark:text-red-400", "text-red-700 dark:text-red-400", "text-red-700 dark:text-red-400", "text-muted-foreground"];

export type StatisticsSelection = { category: "oil" | "air" | "readiness"; status: string; dispatcherId?: string | null; dispatcherName?: string };

function statusExplanation(category: StatisticsSelection["category"], status: string) {
  if (category === "readiness") return "Fleet readiness uses oil-change mileage and service history. Air filters do not affect readiness.";
  const interval = category === "air" ? "80,000 miles" : "30,000 miles for standard sources and TEL, 40,000 for M&K, or 50,000 for Ryder";
  const explanations: Record<Status, string> = {
    Good: "Mileage since the last service is below or at the first warning threshold.",
    Yellow: "Early oil-change warning: above 26,000 miles normally, 32,000 for M&K, or 42,000 for Ryder. Air filters have no yellow category.",
    "Due soon": category === "air"
      ? "More than 60,000 but less than 80,000 miles since the last air-filter change."
      : "Above the red warning threshold but below the service limit: normally over 28,000 miles (TEL: 28,000 or more), M&K over 35,000, or Ryder over 45,000.",
    Due: `Exactly at the service limit: ${interval}.`,
    Overdue: `Mileage since the last service exceeds the service limit: ${interval}. Months since service do not affect this status.`,
    "Missing / invalid": "Current or last-service mileage is missing or invalid, or last-service mileage is higher than the current odometer.",
  };
  return explanations[status as Status];
}

export function serviceStatus(truck: Truck, filter: boolean): Status {
  const baseline = filter ? truck.air_filter : truck.last_oil_change_miles;
  const miles = truck.miles != null && baseline != null ? truck.miles - baseline : null;
  const due = filter ? 80000 : getServiceInterval(truck.source).miles;
  const thresholds = filter ? { yellow: 60000, red: 60000 } : getOilChangeThresholds(truck.source);
  return miles == null || !Number.isFinite(miles) || miles < 0 ? "Missing / invalid"
    : miles > due ? "Overdue" : miles === due ? "Due"
    : miles > thresholds.red ? "Due soon" : miles > thresholds.yellow ? "Yellow" : "Good";
}

export function matchesStatisticsSelection(truck: Truck, selection: StatisticsSelection | null) {
  if (selection?.dispatcherId !== undefined && (truck.dispatcher_id ?? null) !== selection.dispatcherId) return false;
  return !selection || (selection.category === "readiness" ? truck.fleet_pm_readiness === selection.status
    : serviceStatus(truck, selection.category === "air") === selection.status);
}

export function serviceCounts(trucks: Truck[], filter: boolean) {
  const counts = Object.fromEntries(statuses.map(status => [status, 0])) as Record<Status, number>;
  for (const truck of trucks) counts[serviceStatus(truck, filter)]++;
  return counts;
}

export function dispatcherOilOverdueCounts(trucks: Truck[]) {
  const dispatchers = new Map<string | null, { id: string | null; name: string; overdue: number }>();
  for (const truck of trucks) {
    const id = truck.dispatcher_id || null;
    const row = dispatchers.get(id) ?? { id, name: id ? truck.dispatcher_name || 'Unknown dispatcher' : 'No dispatcher', overdue: 0 };
    if (id && truck.dispatcher_name) row.name = truck.dispatcher_name;
    if (serviceStatus(truck, false) === 'Overdue') row.overdue++;
    dispatchers.set(id, row);
  }
  return [...dispatchers.values()].sort((a, b) => b.overdue - a.overdue || a.name.localeCompare(b.name) || (a.id ?? '').localeCompare(b.id ?? ''));
}

export function OilChangeStatistics({ trucks, loading, error, readinessLoading = false, readinessError = false, selection = null, onSelect }: { trucks: Truck[]; loading: boolean; error: boolean; readinessLoading?: boolean; readinessError?: boolean; selection?: StatisticsSelection | null; onSelect?: (selection: StatisticsSelection | null) => void }) {
  const selected = (category: StatisticsSelection["category"], status: string) => selection?.category === category && selection.status === status;
  const choose = (category: StatisticsSelection["category"], status: string) => onSelect?.(selected(category, status) ? null : { category, status });
  return <section id="oil-change-statistics" className="mb-4 rounded-md border p-3" aria-label="Service statistics">
    <p className="mb-3 text-xs text-muted-foreground">Mileage-based statistics for all {trucks.length} trucks matching the page filters. Mileage update freshness is separate.</p>
    {selection && <div className="mb-3 flex flex-wrap items-center gap-3 text-sm"><span>Showing {selection.category === "oil" ? "Oil changes" : selection.category === "air" ? "Air filters" : "Fleet PM Readiness"}: {selection.status}{selection.dispatcherId !== undefined && ` · ${selection.dispatcherName || "No dispatcher"}`}</span><button type="button" className="underline" onClick={() => onSelect?.(null)}>Clear category filter</button><p className="w-full text-xs text-muted-foreground" role="status">{statusExplanation(selection.category, selection.status)}</p></div>}
    {loading ? <p>Loading statistics…</p> : error ? <p role="alert">Could not load service statistics.</p> : <div className="grid gap-4 lg:grid-cols-2">
      {[false, true].map(filter => {
        const counts = serviceCounts(trucks, filter);
        return <div key={String(filter)}><h3 className="mb-2 text-sm font-semibold">{filter ? "Air filters" : "Oil changes"}</h3>
          <div className="grid grid-cols-3 gap-2">{statuses.map((status, index) => <button type="button" key={status} title={statusExplanation(filter ? "air" : "oil", status)} aria-label={`Filter ${filter ? "air filters" : "oil changes"}: ${status}`} aria-pressed={selected(filter ? "air" : "oil", status)} onClick={() => choose(filter ? "air" : "oil", status)} className={`rounded border bg-muted/20 p-2 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selected(filter ? "air" : "oil", status) ? "ring-2 ring-primary" : ""}`}><p className={`text-xl font-semibold ${tones[index]}`}>{counts[status]}</p><p className="text-xs">{status}</p></button>)}</div>
          <p className="mt-2 text-xs text-muted-foreground">{filter ? "Red: over 60,000 mi · Due: 80,000 mi. Air filters have no separate yellow threshold." : "Uses each source’s warning thresholds and service interval."}</p>
        </div>;
      })}
    </div>}
    {!loading && !error && <div className="mt-4 border-t pt-3">
      <h3 className="mb-2 text-sm font-semibold">Overdue oil changes by dispatcher</h3>
      <p className="mb-2 text-xs text-muted-foreground">Trucks past their source’s oil-change mileage limit, matching the page filters.</p>
      {trucks.length === 0 ? <p className="text-sm text-muted-foreground">No trucks match the current filters.</p> : <div className="max-h-72 overflow-auto rounded border">
        <table className="w-full text-sm" aria-label="Overdue oil changes by dispatcher">
          <thead className="sticky top-0 bg-background"><tr><th scope="col" className="px-3 py-2 text-left font-medium">Dispatcher</th><th scope="col" className="px-3 py-2 text-right font-medium">Overdue trucks</th></tr></thead>
          <tbody>{dispatcherOilOverdueCounts(trucks).map(dispatcher => <tr key={dispatcher.id ?? 'unassigned'} className="border-t"><td className="px-3 py-2">{dispatcher.name}</td><td className={`px-3 py-2 text-right tabular-nums ${dispatcher.overdue ? 'font-semibold text-red-700 dark:text-red-400' : 'text-muted-foreground'}`}><button type="button" aria-label={`Show overdue oil changes for ${dispatcher.name}`} aria-pressed={selection?.category === 'oil' && selection.status === 'Overdue' && selection.dispatcherId === dispatcher.id} disabled={!onSelect} onClick={() => onSelect?.(selection?.category === 'oil' && selection.status === 'Overdue' && selection.dispatcherId === dispatcher.id ? null : { category: 'oil', status: 'Overdue', dispatcherId: dispatcher.id, dispatcherName: dispatcher.name })} className="min-w-8 rounded px-2 py-1 underline underline-offset-2 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring aria-pressed:bg-muted aria-pressed:ring-1 aria-pressed:ring-primary">{dispatcher.overdue}</button></td></tr>)}</tbody>
        </table>
      </div>}
    </div>}
    <div className="mt-4 border-t pt-3"><h3 className="mb-2 text-sm font-semibold">Fleet PM Readiness</h3>
      {readinessLoading ? <p className="text-sm">Loading readiness…</p> : readinessError ? <p role="alert">Could not load readiness statistics.</p> : <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">{["READY / GOOD", "DUE SOON", "SERVICE DUE", "SERVICE OVERDUE", "CHECK ODOMETER", "MISSING SERVICE DATA"].map(status => <button type="button" key={status} aria-label={`Filter fleet readiness: ${status}`} aria-pressed={selected("readiness", status)} onClick={() => choose("readiness", status)} className={`rounded border bg-muted/20 p-2 text-left hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${selected("readiness", status) ? "ring-2 ring-primary" : ""}`}><p className="text-xl font-semibold">{trucks.filter(t => t.fleet_pm_readiness === status).length}</p><p className="text-xs">{status}</p></button>)}</div>}
      <p className="mt-2 text-xs text-muted-foreground">Based on the same oil-change mileage and service history as each truck’s page. Air filters are tracked separately.</p>
    </div>
  </section>;
}
