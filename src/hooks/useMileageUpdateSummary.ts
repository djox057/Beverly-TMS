import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { chicagoTodayISO } from "@/lib/mileageUpdateStatus";
import { mileagePeriodBounds, mileagePresetPeriod, type MileageEdit, type MileagePeriodPreset, type MileageUpdateView } from "@/lib/mileageUpdatePeriod";

export function useMileageUpdateSummary(enabled = true) {
  const today = chicagoTodayISO();
  const [month, setMonth] = useState(() => today.slice(0, 7));
  const [preset, setPreset] = useState<MileagePeriodPreset>(() => Number(today.slice(8, 10)) >= 15 ? "second" : "first");
  const [custom, setCustom] = useState(() => mileagePresetPeriod(month, preset === "second" ? "second" : "first"));
  const period = preset === "custom" ? custom : mileagePresetPeriod(month, preset);
  const bounds = mileagePeriodBounds(period);
  const { data: edits = [], isPending, isError } = useQuery({
    queryKey: ["oil-change-mileage-update-summary", bounds?.start, bounds?.endExclusive],
    enabled: enabled && !!bounds,
    staleTime: 30000,
    refetchInterval: enabled ? 60000 : false,
    queryFn: async () => {
      if (!bounds) return [];
      const edits = new Map<string, MileageEdit>();
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await supabase.from("truck_mileage_history")
          .select("truck_id, changed_by")
          .eq("field", "miles")
          .not("new_value", "is", null)
          .gte("changed_at", bounds.start).lt("changed_at", bounds.endExclusive)
          .order("changed_at").order("id")
          .range(offset, offset + 999);
        if (error) throw error;
        // Counts and filters only need each truck/editor pair once.
        for (const edit of data ?? []) edits.set(`${edit.truck_id}:${edit.changed_by ?? ""}`, edit);
        if ((data ?? []).length < 1000) break;
      }
      return [...edits.values()];
    },
  });
  const [view, setView] = useState<MileageUpdateView>("all");
  return { month, setMonth, preset, setPreset, setCustom, period, bounds, edits, isPending, isError, view, setView };
}
