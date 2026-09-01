import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listDriversTool from "./tools/list-drivers";
import listTrucksTool from "./tools/list-trucks";
import listRecentOrdersTool from "./tools/list-recent-orders";
import listBrokersTool from "./tools/list-brokers";
import listCompaniesTool from "./tools/list-companies";
import getOrderDetailsTool from "./tools/get-order-details";
import searchOrdersByDateTool from "./tools/search-orders-by-date";
import getTruckLocationTool from "./tools/get-truck-location";
import listDriverExpensesTool from "./tools/list-driver-expenses";
import getDispatcherPerformanceTool from "./tools/get-dispatcher-performance";
import listHeatmapFacilitiesTool from "./tools/list-heatmap-facilities";

// Direct Supabase issuer required — do NOT use SUPABASE_URL (may be a proxy).
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "beverly-tms-mcp",
  title: "Beverly TMS",
  version: "0.3.0",
  instructions:
    "Read-only access to Beverly TMS trucking dispatch data for the signed-in user. Use `list_drivers`, `list_trucks`, `list_brokers`, and `list_companies` to resolve entities; `list_recent_orders`, `search_orders_by_date`, and `get_order_details` for loads; `get_truck_location` for GPS positions; `list_driver_expenses` for driver debts; and `get_dispatcher_performance` for precalculated dispatcher metrics (freight, miles, RPM); and `list_heatmap_facilities` for Beverly heatmap facility visit counts (pickups/deliveries by shipper/receiver location). All results are scoped by the user's role and RLS.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [
    listDriversTool,
    listTrucksTool,
    listRecentOrdersTool,
    listBrokersTool,
    listCompaniesTool,
    getOrderDetailsTool,
    searchOrdersByDateTool,
    getTruckLocationTool,
    listDriverExpensesTool,
    getDispatcherPerformanceTool,
    listHeatmapFacilitiesTool,
  ],
});
