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
  name: "get_order_details",
  title: "Get order details",
  description:
    "Get the full detail of one order/load by its UUID, broker load number, or internal load number, including its pickup/drop stops.",
  inputSchema: {
    load_number: z
      .string()
      .optional()
      .describe("Exact broker load number or internal load number. Use this or order_id."),
    order_id: z.string().uuid().optional().describe("Order UUID. Use this or load_number."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ load_number, order_id }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    if (!load_number && !order_id) {
      return { content: [{ type: "text", text: "Provide either load_number or order_id" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    let query = supabase.from("orders").select("*").limit(5);
    if (order_id) query = query.eq("id", order_id);
    else query = query.or(`load_number.eq.${load_number},internal_load_number.eq.${load_number}`);
    const { data, error } = await query;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    if (!data || data.length === 0) {
      return { content: [{ type: "text", text: "No matching order found" }], isError: true };
    }
    const ids = data.map((o: { id: string }) => o.id);
    const { data: stops } = await supabase
      .from("pickup_drops")
      .select("*")
      .in("order_id", ids)
      .order("stop_order", { ascending: true });
    const result = data.map((o: { id: string }) => ({
      ...o,
      stops: (stops ?? []).filter((s: { order_id: string }) => s.order_id === o.id),
    }));
    return {
      content: [{ type: "text", text: JSON.stringify(result) }],
      structuredContent: { orders: result },
    };
  },
});
