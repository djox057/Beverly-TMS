import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "get_truck_location",
  title: "Get truck locations",
  description:
    "Get the latest known GPS location for trucks. Optionally filter to one truck number; otherwise returns the latest locations for all visible trucks.",
  inputSchema: {
    truck_number: z.string().optional().describe("Exact truck number to look up."),
    limit: z.number().int().min(1).max(500).optional().describe("Max rows when listing all (default 100)."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ truck_number, limit }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    if (truck_number) {
      const { data, error } = await supabase
        .from("truck_locations")
        .select("truck_id, truck_number, latitude, longitude, location_timestamp, speed, heading")
        .eq("truck_number", truck_number)
        .order("location_timestamp", { ascending: false })
        .limit(1);
      if (error) return { content: [{ type: "text", text: error.message }], isError: true };
      return {
        content: [{ type: "text", text: JSON.stringify(data ?? []) }],
        structuredContent: { locations: data ?? [] },
      };
    }
    const { data, error } = await supabase.rpc("get_latest_truck_locations");
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    const rows = (data ?? []).slice(0, limit ?? 100);
    return {
      content: [{ type: "text", text: JSON.stringify(rows) }],
      structuredContent: { locations: rows },
    };
  },
});
