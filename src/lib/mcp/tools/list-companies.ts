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
  name: "list_companies",
  title: "List companies",
  description: "List the legal operating companies (carriers) in the system with their UUIDs.",
  inputSchema: {
    limit: z.number().int().min(1).max(200).optional().describe("Max rows to return (default 100)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("companies")
      .select("id, name, created_at")
      .order("name", { ascending: true })
      .limit(limit ?? 100);
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    return {
      content: [{ type: "text", text: JSON.stringify(data ?? []) }],
      structuredContent: { companies: data ?? [] },
    };
  },
});
