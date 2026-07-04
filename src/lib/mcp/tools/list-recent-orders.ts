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
  name: "list_recent_orders",
  title: "List recent orders",
  description: "List the most recently created orders/loads visible to the signed-in user. Optionally filter by load number substring, status, or canceled flag.",
  inputSchema: {
    load_number_contains: z.string().optional().describe("Substring match on load_number or internal_load_number."),
    status: z.string().optional().describe("Filter by exact status value."),
    include_canceled: z.boolean().optional().describe("If false (default), excludes canceled orders."),
    limit: z.number().int().min(1).max(100).optional().describe("Max rows to return (default 25)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ load_number_contains, status, include_canceled, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("orders")
      .select("id, load_number, internal_load_number, status, canceled, pickup_datetime, delivery_datetime, freight_amount, driver_price, dispatcher_name, deleted_truck_number, broker_id, created_at")
      .order("created_at", { ascending: false })
      .limit(limit ?? 25);
    if (status) query = query.eq("status", status);
    if (!include_canceled) query = query.eq("canceled", false);
    if (load_number_contains) {
      query = query.or(
        `load_number.ilike.%${load_number_contains}%,internal_load_number.ilike.%${load_number_contains}%`,
      );
    }
    const { data, error } = await query;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? []) }],
      structuredContent: { orders: data ?? [] },
    };
  },
});