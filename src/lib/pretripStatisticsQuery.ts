import { supabase } from "@/integrations/supabase/client";
import { ACTIVE_PRETRIP_SHEET_ID } from "./pretripConstants";
import { pretripWeekEnd } from "./pretripDates";
import { fromZonedTime } from "date-fns-tz";
import type { PretripDispatcherHistory } from "./pretripStatistics";
import type { CompletionEvidence } from "./pretripStatistics";

// Fetch only completion metadata, never photo files or form answers. Respect existing RLS.
export async function fetchPretripStatisticsEvidence(from: string, through: string): Promise<CompletionEvidence[]> {
  const fetchTable = async (table: "pretrip_form_submissions" | "pretrip_photos") => {
    const rows: CompletionEvidence[] = [];
    for (let offset = 0; ; offset += 1000) {
      // The generated Database type does not yet contain the pre-trip tables.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let query = (supabase as any).from(table).select("id, truck_id, inspection_date")
        .gte("inspection_date", from).lte("inspection_date", pretripWeekEnd(through));
      if (table === "pretrip_form_submissions") query = query.eq("sheet_id", ACTIVE_PRETRIP_SHEET_ID).neq("status", "superseded");
      else query = query.is("form_submission_id", null); // Imported photos count through their visible form only.
      const { data, error } = await query.order("id").range(offset, offset + 999);
      if (error) throw error;
      rows.push(...(data ?? []));
      if ((data ?? []).length < 1000) return rows;
    }
  };
  const [forms, photos] = await Promise.all([fetchTable("pretrip_form_submissions"), fetchTable("pretrip_photos")]);
  return [...forms, ...photos];
}


export async function fetchPretripDispatcherHistory(from: string, driverIds: string[]): Promise<PretripDispatcherHistory> {
  const result: PretripDispatcherHistory = { changes: [], drivers: {}, names: {} };
  // Load changes after the selected period too: their OLD values establish earlier ownership.
  for (let start = 0; start < driverIds.length; start += 100) {
    const ids = driverIds.slice(start, start + 100);
    const { data: drivers, error } = await supabase.from("drivers").select("id, dispatcher_id, created_at").in("id", ids);
    if (error) throw error;
    for (const driver of drivers ?? []) result.drivers[driver.id] = driver;
    for (let offset = 0; ; offset += 1000) {
      const { data, error: historyError } = await supabase.from("assignment_history")
        .select("id, driver1_id, dispatcher_id, old_dispatcher_id, dispatcher_name_snapshot, old_dispatcher_name_snapshot, changed_at")
        .eq("change_type", "dispatcher_assignment").in("driver1_id", ids)
        .gte("changed_at", fromZonedTime(`${from}T00:00:00`, "America/Chicago").toISOString())
        .order("changed_at", { ascending: false }).order("id", { ascending: false }).range(offset, offset + 999);
      if (historyError) throw historyError;
      result.changes.push(...(data ?? []));
      if ((data ?? []).length < 1000) break;
    }
  }
  const dispatcherIds = [...new Set([
    ...Object.values(result.drivers).map(d => d.dispatcher_id),
    ...result.changes.flatMap(c => [c.dispatcher_id, c.old_dispatcher_id]),
  ].filter(Boolean))] as string[];
  for (let start = 0; start < dispatcherIds.length; start += 100) {
    const { data, error } = await supabase.from("profiles").select("user_id, full_name, email").in("user_id", dispatcherIds.slice(start, start + 100));
    if (error) throw error;
    for (const profile of data ?? []) result.names[profile.user_id] = profile.full_name || profile.email || "Unknown dispatcher";
  }
  return result;
}
