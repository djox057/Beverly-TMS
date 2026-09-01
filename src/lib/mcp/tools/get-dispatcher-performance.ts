import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

function supabaseForUser(ctx: ToolContext) {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "get_dispatcher_performance",
  title: "Get dispatcher performance",
  description:
    "Read precalculated dispatcher performance periods (freight, driver rate, miles, RPM, order count, avg trucks). Filter by dispatcher name, office, period type, or period start range.",
  inputSchema: {
    dispatcher_name: z.string().optional().describe("Case-insensitive substring match on dispatcher_name."),
    office: z.string().optional().describe("Exact office name (e.g. 'ČAČAK', 'BG 1st floor')."),
    period_type: z.string().optional().describe("Period type, e.g. 'week' or 'month'."),
    from_period_start: z.string().optional().describe("Earliest period_start, YYYY-MM-DD."),
    to_period_start: z.string().optional().describe("Latest period_start, YYYY-MM-DD."),
    limit: z.number().int().min(1).max(500).optional().describe("Max rows to return (default 100)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ dispatcher_name, office, period_type, from_period_start, to_period_start, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("analytics_dispatcher_period")
      .select(
        "dispatcher_id, dispatcher_name, office, period_type, period_start, period_end, total_freight, total_driver_rate, dispatcher_cut, total_miles, rate_per_mile, order_count, avg_trucks, last_calculated_at",
      )
      .order("period_start", { ascending: false })
      .limit(limit ?? 100);
    if (dispatcher_name) query = query.ilike("dispatcher_name", `%${dispatcher_name}%`);
    if (office) query = query.eq("office", office);
    if (period_type) query = query.eq("period_type", period_type);
    if (from_period_start) query = query.gte("period_start", from_period_start);
    if (to_period_start) query = query.lte("period_start", to_period_start);
    const { data, error } = await query;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? []) }],
      structuredContent: { periods: data ?? [] },
    };
  },
});
