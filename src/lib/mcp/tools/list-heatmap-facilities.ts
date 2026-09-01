import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

function supabaseForUser(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

interface FacilityRow {
  address: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  company_name: string | null;
  pickup_count: number;
  delivery_count: number;
  total_visits: number;
}

export default defineTool({
  name: "list_heatmap_facilities",
  title: "List Beverly heatmap facilities",
  description:
    "List shipper/receiver facilities from the Beverly heatmap with pickup, delivery and total visit counts. Optionally restrict to a date range (pickup/delivery dates), filter by state or a name/city/address substring, and sort by visits.",
  inputSchema: {
    start_date: z.string().optional().describe("Start date (YYYY-MM-DD) of the visit window."),
    end_date: z.string().optional().describe("End date (YYYY-MM-DD) of the visit window."),
    state: z.string().optional().describe("Two-letter state code filter, e.g. IL."),
    search: z
      .string()
      .optional()
      .describe("Case-insensitive substring match on company name, city, or address."),
    sort_by: z
      .enum(["total_visits", "pickup_count", "delivery_count", "company_name", "city"])
      .optional()
      .describe("Sort key (default total_visits, descending for counts)."),
    limit: z.number().int().min(1).max(500).optional().describe("Max rows to return (default 100)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ start_date, end_date, state, search, sort_by, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase.rpc("get_facility_visit_counts", {
      p_start_date: start_date ?? null,
      p_end_date: end_date ?? null,
    });
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };

    let rows = (data ?? []) as FacilityRow[];

    if (state) {
      const st = state.trim().toUpperCase();
      rows = rows.filter((r) => (r.state || "").trim().toUpperCase() === st);
    }
    if (search) {
      const q = search.toLowerCase().trim();
      rows = rows.filter(
        (r) =>
          (r.company_name || "").toLowerCase().includes(q) ||
          (r.city || "").toLowerCase().includes(q) ||
          (r.address || "").toLowerCase().includes(q),
      );
    }

    const key = sort_by ?? "total_visits";
    const isText = key === "company_name" || key === "city";
    rows = [...rows].sort((a, b) => {
      if (isText) {
        return String(a[key] ?? "").localeCompare(String(b[key] ?? ""));
      }
      return Number(b[key] ?? 0) - Number(a[key] ?? 0);
    });

    const sliced = rows.slice(0, limit ?? 100);
    return {
      content: [{ type: "text", text: JSON.stringify(sliced) }],
      structuredContent: { facilities: sliced, total_matched: rows.length },
    };
  },
});
