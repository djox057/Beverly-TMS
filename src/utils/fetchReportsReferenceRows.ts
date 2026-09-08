import { supabase } from "@/integrations/supabase/client";

/** Stable pagination avoids silently dropping active fleet rows at the API row cap. */
export async function fetchReportsReferenceRows(table: "drivers" | "trucks" | "truck_telemetry", columns: string): Promise<any[]> {
  const rows: any[] = [];
  for (let offset = 0; ; offset += 1000) {
    const request = table === "truck_telemetry"
      ? supabase.from(table).select(columns)
      : supabase.from(table).select(columns).eq("is_active", true);
    const { data, error } = await request.order(table === "truck_telemetry" ? "truck_id" : "id")
      .range(offset, offset + 999);
    if (error) throw error;
    rows.push(...(data || []));
    if ((data?.length || 0) < 1000) return rows;
  }
}
