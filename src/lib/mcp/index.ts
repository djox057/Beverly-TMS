import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listDriversTool from "./tools/list-drivers";
import listTrucksTool from "./tools/list-trucks";
import listRecentOrdersTool from "./tools/list-recent-orders";

// Direct Supabase issuer required — do NOT use SUPABASE_URL (may be a proxy).
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "beverly-tms-mcp",
  title: "Beverly TMS",
  version: "0.1.0",
  instructions:
    "Read-only access to Beverly TMS trucking dispatch data for the signed-in user. Use `list_drivers` to find drivers, `list_trucks` to find trucks, and `list_recent_orders` to inspect recent loads. All results are scoped by the user's role and RLS.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listDriversTool, listTrucksTool, listRecentOrdersTool],
});