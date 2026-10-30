import { useOilChangeFilterState } from "./useOilChangeFilterState";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { chicagoTodayISO } from "@/lib/mileageUpdateStatus";
import { mileagePeriodBounds, mileagePresetPeriod, type MileageEdit, type MileagePeriodPreset, type MileageUpdateView, type MileageTruckScope } from "@/lib/mileageUpdatePeriod";

export function useMileageUpdateSummary(enabled = true) {
  const today = chicagoTodayISO();
  const [month, setMonth] = useOilChangeFilterState("month", () => today.slice(0, 7), value => typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value));
  const [preset, setPreset] = useOilChangeFilterState<MileagePeriodPreset>("preset", () => Number(today.slice(8, 10)) >= 15 ? "second" : "first", value => ["first", "second", "custom"].includes(String(value)));
  const [custom, setCustom] = useOilChangeFilterState("customPeriod", () => mileagePresetPeriod(month, preset === "second" ? "second" : "first"), value => typeof value === "object" && value !== null && "start" in value && "end" in value && typeof value.start === "string" && typeof value.end === "string" && (value.start === "" || /^\d{4}-\d{2}-\d{2}$/.test(value.start)) && (value.end === "" || /^\d{4}-\d{2}-\d{2}$/.test(value.end)));
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
          .in("field", ["miles", "last_oil_change_miles"])
          .not("new_value", "is", null)
          .gte("changed_at", bounds.start).lt("changed_at", bounds.endExclusive)
          .order("changed_at").order("id")
          .range(offset, offset + 999);
        if (error) throw error;
        // Counts and filters only need each truck/editor pair once.
        for (const edit of data ?? []) edits.set(`${edit.truck_id}:${edit.changed_by ?? ""}`, edit);
        if ((data ?? []).length < 1000) break;
      }
      // A saved oil service is also a mileage check on its service date.
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await supabase.from("truck_service_log_entries")
          .select("truck_id, created_by")
          .in("entry_type", ["Oil Change", "Air Filter + Oil change"])
          .eq("is_deleted", false).not("odometer", "is", null)
          .gte("log_date", period.start).lte("log_date", period.end < today ? period.end : today)
          .order("id").range(offset, offset + 999);
        if (error) throw error;
        for (const entry of data ?? []) {
          const edit = { truck_id: entry.truck_id, changed_by: entry.created_by };
          edits.set(`${edit.truck_id}:${edit.changed_by ?? ""}`, edit);
        }
        if ((data ?? []).length < 1000) break;
      }
      return [...edits.values()];
    },
  });
  const [scope, setScope] = useOilChangeFilterState<MileageTruckScope>("scope", "all", value => value === "all" || value === "assigned");
  const [view, setView] = useOilChangeFilterState<MileageUpdateView>("view", "all", value => ["all", "updated", "remaining"].includes(String(value)));
  return { month, setMonth, preset, setPreset, setCustom, period, bounds, edits, isPending, isError, scope, setScope, view, setView };
}
