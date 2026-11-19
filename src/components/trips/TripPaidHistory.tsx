import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { addDays, format } from "date-fns";
import { ChevronDown } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { TableHead } from "@/components/ui/table";
import { supabase } from "@/integrations/supabase/client";
import { formatCurrency } from "@/lib/utils";

type TripDriver = { driver1Id?: string | null; driverName?: string | null; truckNumber?: string | null };
type PayDriver = { id: string; name: string; truck: string };

async function fetchStatements(driver: PayDriver, legacy: boolean) {
  const pageSize = 500;
  const rows: { week_start: string; paid_amount: number }[] = [];

  for (let offset = 0; ; offset += pageSize) {
    const query = supabase.from("trip_week_statements").select("week_start, paid_amount");
    const scoped = legacy
      ? query.is("driver_id", null).eq("driver_name", driver.name)
      : query.eq("driver_id", driver.id);
    const { data, error } = await scoped.order("week_start", { ascending: false }).order("id")
      .range(offset, offset + pageSize - 1);

    if (error) throw error;
    rows.push(...data);
    if (data.length < pageSize) return rows;
  }
}

async function fetchPaidHistory(driver: PayDriver) {
  const [statements, legacy] = await Promise.all([fetchStatements(driver, false), fetchStatements(driver, true)]);
  let ambiguousLegacy = false;
  const driverWeeks = new Map(statements.map(row => [row.week_start, Math.round(row.paid_amount * 100)]));
  const legacyWeeks = new Map<string, number>();
  const unmatchedLegacy = legacy.filter(row => !driverWeeks.has(row.week_start));

  if (unmatchedLegacy.length) {
    const { data: matches, error } = await supabase.from("drivers").select("id").eq("name", driver.name).limit(2);
    if (error) throw error;
    ambiguousLegacy = matches.length !== 1 || matches[0].id !== driver.id;
    if (!ambiguousLegacy) {
      for (const row of unmatchedLegacy) {
        legacyWeeks.set(row.week_start, (legacyWeeks.get(row.week_start) ?? 0) + Math.round(row.paid_amount * 100));
      }
    }
  }

  const weeks = [...driverWeeks, ...legacyWeeks].sort(([a], [b]) => b.localeCompare(a));
  const total = weeks.reduce((sum, [, cents]) => sum + cents, 0) / 100;
  return { weeks, total, ambiguousLegacy };
}

function PaidHistory({ driver, viewerScope }: { driver: PayDriver; viewerScope: readonly unknown[] }) {
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ["trip-week-statements", "paid-history", ...viewerScope, driver.id, driver.name],
    queryFn: () => fetchPaidHistory(driver),
  });

  if (isPending) return <p role="status" className="text-sm text-muted-foreground">Loading paid history…</p>;
  if (isError || !data) return (
    <div className="space-y-1 text-sm">
      <p role="alert" className="text-destructive">Couldn’t load paid history.</p>
      <button type="button" className="underline" onClick={() => void refetch()}>Try again</button>
    </div>
  );

  return (
    <div className="space-y-3">
      <dl className="flex items-center justify-between gap-3 rounded-md bg-muted px-3 py-2">
        <dt className="text-sm text-muted-foreground">Total paid · All weeks</dt>
        <dd className="font-semibold tabular-nums">{formatCurrency(data.total)}</dd>
      </dl>
      {data.weeks.length ? (
        <details className="group rounded-md border">
          <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2 text-sm font-medium [&::-webkit-details-marker]:hidden">
            Week by week
            <ChevronDown aria-hidden="true" className="h-4 w-4 transition-transform group-open:rotate-180" />
          </summary>
          <dl className="max-h-60 overflow-y-auto border-t text-sm">
            {data.weeks.map(([week, cents]) => {
              const start = new Date(`${week}T12:00:00`);
              const end = addDays(start, 6);
              return (
                <div key={week} className="flex items-center justify-between gap-3 border-b px-3 py-2 last:border-b-0">
                  <dt className="text-muted-foreground">{format(start, "MMM d")} – {format(end, "MMM d, yyyy")}</dt>
                  <dd className="whitespace-nowrap tabular-nums">{formatCurrency(cents / 100)}</dd>
                </div>
              );
            })}
          </dl>
        </details>
      ) : <p className="text-sm text-muted-foreground">No uploaded statements for this driver.</p>}
      {data.ambiguousLegacy && (
        <p className="text-sm text-muted-foreground">Some older statements are missing a unique driver match.</p>
      )}
    </div>
  );
}

function PaidHistoryContent({ trips, viewerScope }: { trips: TripDriver[]; viewerScope: readonly unknown[] }) {
  const [selectedId, setSelectedId] = useState("");
  const drivers = new Map<string, PayDriver>();
  for (const trip of trips) {
    if (trip.driver1Id && trip.driverName && !drivers.has(trip.driver1Id)) {
      drivers.set(trip.driver1Id, { id: trip.driver1Id, name: trip.driverName, truck: trip.truckNumber ?? "" });
    }
  }
  const options = [...drivers.values()].sort((a, b) => a.name.localeCompare(b.name));
  const driver = options.length === 1 ? options[0] : drivers.get(selectedId);

  return (
    <PopoverContent align="end" aria-label="Paid history" className="w-80 max-w-[calc(100vw-1rem)] space-y-3">
      <h3 className="font-semibold">Paid history</h3>
      {options.length > 1 && (
        <select aria-label="Driver" className="h-9 w-full rounded-md border bg-background px-2 text-sm"
          value={driver?.id ?? ""} onChange={event => setSelectedId(event.target.value)}>
          <option value="" disabled>Select a driver</option>
          {options.map(option => <option key={option.id} value={option.id}>
            {option.name}{option.truck && ` (#${option.truck})`}
          </option>)}
        </select>
      )}
      {options.length === 1 && <p className="text-sm text-muted-foreground">{driver?.name}</p>}
      {options.length === 0 && <p className="text-sm text-muted-foreground">Search Trips for a driver to view their paid history.</p>}
      {driver && <PaidHistory driver={driver} viewerScope={viewerScope} />}
    </PopoverContent>
  );
}

export function TripPaidHeader({ trips, viewerScope }: { trips: TripDriver[]; viewerScope: readonly unknown[] }) {
  const [open, setOpen] = useState(false);

  return (
    <TableHead className="relative w-[120px] min-w-[120px] max-w-[120px] bg-yellow-200 text-center dark:bg-yellow-800">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button type="button" className="absolute inset-0 w-full select-none" title="Double-click to view paid history"
            onClick={event => { if (event.detail > 0) event.preventDefault(); }} onDoubleClick={() => setOpen(true)}>
            Paid
          </button>
        </PopoverTrigger>
        {open && <PaidHistoryContent trips={trips} viewerScope={viewerScope} />}
      </Popover>
    </TableHead>
  );
}
