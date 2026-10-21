import { MonthPicker } from "./MonthPicker";
import { useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { countMileageUpdates, filterMileageUpdateTrucks } from "@/lib/mileageUpdatePeriod";
import { useMileageUpdateSummary } from "@/hooks/useMileageUpdateSummary";

export function MileageUpdateSummary({ trucks, trucksLoading, trucksError, summary }: {
  trucks: readonly { id: string; driver1_id: string | null }[];
  summary: ReturnType<typeof useMileageUpdateSummary>;
  trucksLoading: boolean;
  trucksError: boolean;
}) {
  const { month, setMonth, preset, setPreset, setCustom, period, bounds, edits, isPending, isError, scope, setScope, view, setView } = summary;
  const counts = useMemo(() => countMileageUpdates(filterMileageUpdateTrucks(trucks, edits, "all", scope), edits), [trucks, edits, scope]);

  return (
    <section className="mb-4 space-y-3 rounded-md border bg-muted/20 p-3" aria-label="Mileage updates by period">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="mileage-period-month">Month</Label>
          <MonthPicker id="mileage-period-month" value={month} onChange={value => { setMonth(value); if (preset === "custom") setPreset("first"); }} />
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant={preset === "first" ? "default" : "outline"} aria-pressed={preset === "first"} onClick={() => setPreset("first")}>1st–7th</Button>
          <Button size="sm" variant={preset === "second" ? "default" : "outline"} aria-pressed={preset === "second"} onClick={() => setPreset("second")}>15th–22nd</Button>
        </div>
        <div className="space-y-1">
          <Label htmlFor="mileage-period-from">From</Label>
          <Input id="mileage-period-from" type="date" className="w-40" value={period.start}
            onChange={(event) => { setCustom({ ...period, start: event.target.value }); setPreset("custom"); }} />
        </div>
        <div className="space-y-1">
          <Label htmlFor="mileage-period-to">To</Label>
          <Input id="mileage-period-to" type="date" className="w-40" value={period.end}
            onChange={(event) => { setCustom({ ...period, end: event.target.value }); setPreset("custom"); }} />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex gap-2" role="group" aria-label="Truck scope">
          {([['all', 'All trucks'], ['assigned', 'Assigned trucks']] as const).map(([value, label]) => (
            <Button key={value} size="sm" variant={scope === value ? "default" : "outline"} aria-pressed={scope === value} onClick={() => setScope(value)}>{label}</Button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Mileage update status">
          {([['all', 'All updates'], ['updated', 'Updated'], ['remaining', 'Not updated']] as const).map(([value, label]) => (
            <Button key={value} size="sm" variant={view === value ? "default" : "outline"} aria-pressed={view === value} onClick={() => setView(value)}>{label}</Button>
          ))}
        </div>
      </div>
      <div role="status" aria-live="polite" className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
        {!bounds ? <span className="text-destructive">Select a valid period with From on or before To.</span>
          : isError || trucksError ? <span className="text-destructive">Could not load mileage update counts.</span>
          : isPending || trucksLoading ? <span className="text-muted-foreground">Loading mileage update counts…</span>
          : <>
            <span>{scope === "assigned" ? "Assigned trucks updated" : "All trucks updated"} <strong>{counts.updated} / {counts.total}</strong></span>
            <span className="text-muted-foreground">{counts.remaining} remaining</span>
            <span>People who updated mileage <strong>{counts.people}</strong></span>
          </>}
      </div>
      <p className="text-xs text-muted-foreground">Recorded total-mileage changes for {scope === "assigned" ? "trucks with an assigned driver" : "all trucks"} in the current filters. Each truck and person counts once. Dates use Chicago time.</p>
    </section>
  );
}
