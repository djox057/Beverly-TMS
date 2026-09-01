import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_driver_expenses",
  title: "List driver expenses",
  description:
    "List driver expenses/debts. Optionally filter by driver UUID, truck number, status, or expense date range.",
  inputSchema: {
    driver_id: z.string().uuid().optional().describe("Filter by driver UUID."),
    truck_number: z.string().optional().describe("Exact truck number."),
    status: z.string().optional().describe("Filter by exact status value (e.g. 'pending', 'paid')."),
    from_date: z.string().optional().describe("Earliest expense_date, YYYY-MM-DD."),
    to_date: z.string().optional().describe("Latest expense_date, YYYY-MM-DD."),
    limit: z.number().int().min(1).max(500).optional().describe("Max rows to return (default 100)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ driver_id, truck_number, status, from_date, to_date, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("driver_expenses")
      .select(
        "id, driver_id, truck_number, trailer_number, name, explanation, expense_date, amount, status, paid_date, paid_amount, expense_type",
      )
      .order("expense_date", { ascending: false })
      .limit(limit ?? 100);
    if (driver_id) query = query.eq("driver_id", driver_id);
    if (truck_number) query = query.eq("truck_number", truck_number);
    if (status) query = query.eq("status", status);
    if (from_date) query = query.gte("expense_date", from_date);
    if (to_date) query = query.lte("expense_date", to_date);
    const { data, error } = await query;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? []) }],
      structuredContent: { expenses: data ?? [] },
    };
  },
});
