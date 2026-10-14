import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { busChannel } from "@/hooks/realtimeBus";
import { buildServiceEntries, serviceSummary, type ServiceTruck, type ServiceEntry } from "@/lib/truckServiceLog";
import { chicagoTodayISO } from "@/lib/mileageUpdateStatus";

export function useFleetReadiness(trucks: Array<{ id: string }>) {
  const client = useQueryClient();
  const ids = useMemo(() => trucks.map(t => t.id).sort(), [trucks]);
  const [today, setToday] = useState(chicagoTodayISO);
  useEffect(() => { const timer = setInterval(() => setToday(chicagoTodayISO()), 60000); return () => clearInterval(timer); }, []);
  const query = useQuery({
    queryKey: ["fleet-pm-readiness", ids, today], enabled: ids.length > 0, staleTime: 30000,
    queryFn: async () => {
      const db = supabase as any;
      const all = async (table: string, select: string, key: string) => {
        const rows: any[] = [];
        for (let batch = 0; batch < ids.length; batch += 100) {
          for (let from = 0; ; from += 1000) {
            const result = await db.from(table).select(select).in(key, ids.slice(batch, batch + 100)).order("id").range(from, from + 999);
            if (result.error) throw result.error;
            rows.push(...(result.data ?? []));
            if ((result.data?.length ?? 0) < 1000) break;
          }
        }
        return rows;
      };
      const [details, history, saved] = await Promise.all([
        all("trucks", "id,truck_number,source,start_miles,baseline_start_date,baseline_note,oil_spec,baseline_created_by,miles,miles_updated_at,last_oil_change_miles,oil_change_date,air_filter,last_oc_invoice,oil_change_note", "id"),
        all("truck_mileage_history", "id,truck_id,field,old_value,new_value,changed_at,changed_by", "truck_id"),
        all("truck_service_log_entries", "*", "truck_id"),
      ]);
      return { details: details as ServiceTruck[], history, saved };
    },
  });
  useEffect(() => {
    const refresh = () => { client.invalidateQueries({ queryKey: ["fleet-pm-readiness"] }); };
    const channel = busChannel(refresh);
    for (const table of ["trucks", "truck_mileage_history", "truck_service_log_entries"]) channel.on("postgres_changes", { event: "*", schema: "public", table }, refresh);
    channel.subscribe();
    return () => { channel?.unsubscribe(); };
  }, [client]);
  const statuses = useMemo(() => {
    const map = new Map<string, string>();
    for (const truck of query.data?.details ?? []) {
      const history = query.data!.history.filter(e => e.truck_id === truck.id).sort((a, b) => a.changed_at.localeCompare(b.changed_at) || a.id.localeCompare(b.id));
      const saved = query.data!.saved.filter(e => e.truck_id === truck.id) as ServiceEntry[];
      map.set(truck.id, serviceSummary(truck, buildServiceEntries(truck, history, saved), today).status);
    }
    return map;
  }, [query.data, today]);
  return { statuses, loading: ids.length > 0 && query.isPending, error: query.isError };
}
