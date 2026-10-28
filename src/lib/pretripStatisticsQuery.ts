import { supabase } from "@/integrations/supabase/client";
import { ACTIVE_PRETRIP_SHEET_ID } from "./pretripConstants";
import { pretripWeekEnd } from "./pretripDates";
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

