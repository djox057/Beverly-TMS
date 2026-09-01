import { createClient } from "@supabase/supabase-js";
import { defineTool, type ToolContext } from "@lovable.dev/mcp-js";
import { z } from "zod";

function supabaseForUser(ctx: ToolContext) {
  return createClient((Deno.env.get("SUPABASE_URL") ?? ""), (Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? ""), {
    global: { headers: { Authorization: `Bearer ${ctx.getToken()}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export default defineTool({
  name: "list_brokers",
  title: "List brokers",
  description: "List brokers/customers with credit status. Optionally filter by name or MC number substring.",
  inputSchema: {
    search: z.string().optional().describe("Case-insensitive substring match on broker name or MC number."),
    limit: z.number().int().min(1).max(200).optional().describe("Max rows to return (default 50)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ search, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    let query = supabase
      .from("brokers")
      .select("id, name, mc_number, address, credit_status, credit_limit_amount, credit_used_amount")
      .order("name", { ascending: true })
      .limit(limit ?? 50);
    if (search) query = query.or(`name.ilike.%${search}%,mc_number.ilike.%${search}%`);
    const { data, error } = await query;
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? []) }],
      structuredContent: { brokers: data ?? [] },
    };
  },
});
