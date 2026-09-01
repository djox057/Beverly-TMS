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
  name: "search_orders_by_date",
  title: "Search orders by date range",
  description:
    "Search orders/loads in a date range by pickup or delivery date. Optionally filter by dispatcher name, truck number, or office.",
  inputSchema: {
    from_date: z.string().describe("Start date (inclusive), ISO format YYYY-MM-DD."),
    to_date: z.string().describe("End date (inclusive), ISO format YYYY-MM-DD."),
    date_field: z
      .enum(["pickup", "delivery"])
      .optional()
      .describe("Which date to filter on: 'pickup' (default) or 'delivery'."),
    dispatcher_name: z.string().optional().describe("Case-insensitive substring match on dispatcher_name."),
    truck_number: z.string().optional().describe("Exact truck number."),
    include_canceled: z.boolean().optional().describe("If false (default), excludes canceled orders."),
    limit: z.number().int().min(1).max(500).optional().describe("Max rows to return (default 100)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (
    { from_date, to_date, date_field, dispatcher_name, truck_number, include_canceled, limit },
    ctx,
  ) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const col = date_field === "delivery" ? "delivery_datetime" : "pickup_datetime";
    let query = supabase
      .from("orders")
      .select(
        "id, load_number, internal_load_number, load_company_code, status, canceled, pickup_datetime, delivery_datetime, freight_amount, driver_price, loaded_miles, dh_miles, dispatcher_name, deleted_truck_number, office",
      )
      .gte(col, `${from_date}T00:00:00`)
      .lte(col, `${to_date}T23:59:59`)
      .order(col, { ascending: false })
      .limit(limit ?? 100);
    if (!include_canceled) query = query.eq("canceled", false);
    if (dispatcher_name) query = query.ilike("dispatcher_name", `%${dispatcher_name}%`);
    if (truck_number) query = query.eq("deleted_truck_number", truck_number);
    const { data, error } = await query;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? []) }],
      structuredContent: { orders: data ?? [] },
    };
  },
});
