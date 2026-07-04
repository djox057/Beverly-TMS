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
  name: "list_trucks",
  title: "List trucks",
  description: "List trucks visible to the signed-in user. Optionally filter by truck number substring or company.",
  inputSchema: {
    truck_number_contains: z.string().optional().describe("Substring match on truck_number."),
    company_id: z.string().uuid().optional().describe("Filter by owning company UUID."),
    limit: z.number().int().min(1).max(200).optional().describe("Max rows to return (default 50)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ truck_number_contains, company_id, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("trucks")
      .select("id, truck_number, vin, plate, company_id, status")
      .order("truck_number", { ascending: true })
      .limit(limit ?? 50);
    if (truck_number_contains) query = query.ilike("truck_number", `%${truck_number_contains}%`);
    if (company_id) query = query.eq("company_id", company_id);
    const { data, error } = await query;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? []) }],
      structuredContent: { trucks: data ?? [] },
    };
  },
});