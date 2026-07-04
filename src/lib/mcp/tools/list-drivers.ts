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
  name: "list_drivers",
  title: "List drivers",
  description: "List drivers visible to the signed-in user. Optionally filter by active status or a name substring.",
  inputSchema: {
    active_only: z.boolean().optional().describe("If true, only return drivers with status = 'active'."),
    name_contains: z.string().optional().describe("Case-insensitive substring match on driver full name."),
    limit: z.number().int().min(1).max(200).optional().describe("Max rows to return (default 50)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ active_only, name_contains, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("drivers")
      .select("id, full_name, phone, status, truck_number, trailer_number, company_id, hire_date")
      .order("full_name", { ascending: true })
      .limit(limit ?? 50);
    if (active_only) query = query.eq("status", "active");
    if (name_contains) query = query.ilike("full_name", `%${name_contains}%`);
    const { data, error } = await query;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? []) }],
      structuredContent: { drivers: data ?? [] },
    };
  },
});