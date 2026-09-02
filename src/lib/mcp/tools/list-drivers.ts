import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_drivers",
  title: "List drivers",
  description: "List drivers visible to the signed-in user. Optionally filter by active status or a name substring.",
  inputSchema: {
    active_only: z.boolean().optional().describe("If true, only return active drivers."),
    name_contains: z.string().optional().describe("Case-insensitive substring match on driver name."),
    limit: z.number().int().min(1).max(200).optional().describe("Max rows to return (default 50)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ active_only, name_contains, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    // Columns are `name` / `is_active` — `full_name`, `status`, `truck_number`
    // and `trailer_number` do not exist on public.drivers and returned 400s.
    let query = supabase
      .from("drivers")
      .select("id, name, phone, is_active, company_id, hire_date")
      .order("name", { ascending: true })
      .limit(limit ?? 50);
    if (active_only) query = query.eq("is_active", true);
    if (name_contains) query = query.ilike("name", `%${name_contains}%`);
    const { data, error } = await query;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? []) }],
      structuredContent: { drivers: data ?? [] },
    };
  },
});