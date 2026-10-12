import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { chicagoTodayISO } from "@/lib/mileageUpdateStatus";
import { countMileageUpdates, mileagePeriodBounds, mileagePresetPeriod, type MileageEdit, type MileagePeriodPreset } from "@/lib/mileageUpdatePeriod";

export function MileageUpdateSummary({ trucks, trucksLoading, trucksError }: {
  trucks: readonly { id: string }[];
  trucksLoading: boolean;
  trucksError: boolean;
}) {
  const today = chicagoTodayISO();
  const [month, setMonth] = useState(() => today.slice(0, 7));
  const [preset, setPreset] = useState<MileagePeriodPreset>(() => Number(today.slice(8, 10)) >= 15 ? "second" : "first");
  const [custom, setCustom] = useState(() => mileagePresetPeriod(month, preset === "second" ? "second" : "first"));
  const period = preset === "custom" ? custom : mileagePresetPeriod(month, preset);
  const bounds = mileagePeriodBounds(period);
  const { data: edits = [], isPending, isError } = useQuery({
    queryKey: ["oil-change-mileage-update-summary", bounds?.start, bounds?.endExclusive],
    enabled: !!bounds,
    staleTime: 30000,
    refetchInterval: 60000,
    queryFn: async () => {
      if (!bounds) return [];
      const edits: MileageEdit[] = [];
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await supabase.from("truck_mileage_history")
          .select("truck_id, changed_by")
          .eq("field", "miles")
          .not("new_value", "is", null)
          .gte("changed_at", bounds.start).lt("changed_at", bounds.endExclusive)
          .order("changed_at").order("id")
          .range(offset, offset + 999);
        if (error) throw error;
        edits.push(...(data ?? []));
        if ((data ?? []).length < 1000) break;
      }
      return edits;
    },
  });
  const counts = useMemo(() => countMileageUpdates(trucks, edits), [trucks, edits]);

  return (
    <section className="mb-4 space-y-3 rounded-md border bg-muted/20 p-3" aria-label="Mileage updates by period">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="mileage-period-month">Month</Label>
          <Input id="mileage-period-month" type="month" className="w-44" value={month} onChange={(event) => setMonth(event.target.value)} />
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
      <div role="status" aria-live="polite" className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
        {!bounds ? <span className="text-destructive">Select a valid period with From on or before To.</span>
          : isError || trucksError ? <span className="text-destructive">Could not load mileage update counts.</span>
          : isPending || trucksLoading ? <span className="text-muted-foreground">Loading mileage update counts…</span>
          : <>
            <span>Trucks updated <strong>{counts.updated} / {counts.total}</strong></span>
            <span className="text-muted-foreground">{counts.remaining} remaining</span>
            <span>People who updated mileage <strong>{counts.people}</strong></span>
          </>}
      </div>
      <p className="text-xs text-muted-foreground">Recorded total-mileage changes for trucks in the current filters. Each truck and person counts once. Dates use Chicago time.</p>
    </section>
  );
}
