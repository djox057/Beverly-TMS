import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { subscribeTable } from "@/hooks/realtimeBus";
import { useAuthContext } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { chicagoToday, isOpenRepair } from "@/lib/yardRepairDue";
import type { Database } from "@/integrations/supabase/types";

export type YardRepair = Database["public"]["Tables"]["mandatory_yard_repairs"]["Row"];
export type YardRepairInput = Pick<YardRepair, "truck_id" | "driver_id" | "description" | "service_type" | "due_date" | "status" | "status_note" | "dispatch_informed">;
export const YARD_REPAIR_VIEW_ROLES = ["admin", "manager", "maintenance", "safety", "yard", "dispatch", "supervisor", "afterhours", "chicago_management", "accounting", "claims"] as const;
export const YARD_REPAIR_EDIT_ROLES = ["admin", "manager", "maintenance"] as const;

export function useChicagoToday() {
  const [today, setToday] = useState(chicagoToday);
  useEffect(() => {
    const update = () => setToday(chicagoToday());
    const timer = window.setInterval(update, 60_000);
    window.addEventListener("focus", update);
    return () => { window.clearInterval(timer); window.removeEventListener("focus", update); };
  }, []);
  return today;
}

export function useMandatoryYardRepairs(activeOnly = false) {
  const { roles, user } = useAuthContext();
  const enabled = !!user && roles.some(role => YARD_REPAIR_VIEW_ROLES.some(allowed => allowed === role));
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["mandatory-yard-repairs", user?.id, activeOnly],
    enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const rows: YardRepair[] = [];
      for (let start = 0; ; start += 1000) {
        let request = supabase.from("mandatory_yard_repairs").select("*").order("due_date").order("id").range(start, start + 999);
        if (activeOnly) request = request.in("status", ["pending", "in_progress"]);
        const { data, error } = await request;
        if (error) throw error;
        rows.push(...data);
        if (data.length < 1000) return rows;
      }
    },
  });
  useEffect(() => {
    if (!enabled) return;
    const refresh = () => { void client.invalidateQueries({ queryKey: ["mandatory-yard-repairs"] }); };
    return subscribeTable("mandatory_yard_repairs", refresh, refresh, "mandatory-yard-repairs");
  }, [client, enabled]);
  const sendNotification = async (taskId: string) => {
    const { data, error } = await supabase.functions.invoke("notify-mandatory-yard-repair", { body: { taskId } });
    if (error || data?.error || !data?.sent) throw new Error("Email was not sent");
  };
  const notifyDispatcher = useMutation({
    mutationFn: sendNotification,
    onSuccess: () => { void client.invalidateQueries({ queryKey: ["mandatory-yard-repairs"] }); toast.success("Dispatcher email sent"); },
    onError: () => { void client.invalidateQueries({ queryKey: ["mandatory-yard-repairs"] }); toast.warning("Email was not sent. Check the assigned dispatcher and retry."); },
  });
  const save = useMutation({
    mutationFn: async ({ id, values }: { id?: string; values: YardRepairInput }) => {
      const request = id ? supabase.from("mandatory_yard_repairs").update(values).eq("id", id) : supabase.from("mandatory_yard_repairs").insert(values);
      const { data, error } = await request.select().single();
      if (error) throw error;
      if (!id && data.service_type === "mandatory_yard_repair" && isOpenRepair(data.status)) {
        try { await sendNotification(data.id); }
        catch { toast.warning("Task saved, but dispatcher email was not sent. Use Retry Email."); }
      }
      return data;
    },
    onSuccess: () => { void client.invalidateQueries({ queryKey: ["mandatory-yard-repairs"] }); toast.success("Repair task saved"); },
    onError: () => toast.error("Could not save repair task. Please try again."),
  });
  const byTruck = useMemo(() => {
    const map = new Map<string, YardRepair[]>();
    for (const task of query.data || []) {
      if (!isOpenRepair(task.status)) continue;
      const list = map.get(task.truck_id) || [];
      list.push(task);
      map.set(task.truck_id, list);
    }
    return map;
  }, [query.data]);
  return { ...query, tasks: query.data || [], byTruck, save, notifyDispatcher };
}
