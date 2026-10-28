import { useEffect } from "react";
import { matchPath, useLocation } from "react-router-dom";

const appTitle = "Beverly TMS - Fleet Operations Management";

// Keep these labels aligned with the names shown in the app's navigation.
const pageTitles: Record<string, string> = {
  "/": "Dashboard",
  "/login": "Login",
  "/reset-password": "Reset Password",
  "/oauth/consent": "OAuth Consent",
  "/.lovable/oauth/consent": "OAuth Consent",
  "/admin/users": "User Management",
  "/new-order": "New Load",
  "/edit-order/:id": "Edit Load",
  "/orders": "Loads",
  "/bg-loads": "BG Loads",
  "/lale-loads": "LALE Loads",
  "/ues-loads": "UES Loads",
  "/yard-loads": "Loads at the Yard",
  "/trucks": "Trucks",
  "/trailers": "Trailers",
  "/drivers": "Drivers",
  "/upcoming-drivers": "Upcoming Drivers",
  "/driver-expenses": "Driver Expenses",
  "/brokers": "Brokers",
  "/fleets": "Fleets",
  "/reports": "Reports",
  "/yard-arrivals": "Yard Arrivals",
  "/recovery-loads": "Recovery Loads & Prebook",
  "/analytics": "Analytics",
  "/dispatcher-tier": "Dispatcher Performance",
  "/dispatcher-tier/:id": "Dispatcher Performance",
  "/drivers-complaints": "Drivers Complaints",
  "/beverly-heatmap": "Beverly Heatmap",
  "/alerts": "Safety and Maintenance",
  "/mandatory-yard-repair": "Mandatory Yard Repair",
  "/repairs": "Maintenance and Repairs",
  "/fuel-reports": "Fuel Reports",
  "/efs-requests": "EFS Requests",
  "/trips": "Trips",
  "/trucks-map": "Live Map",
  "/stuff": "Stuff",
  "/stuff/:driverId": "Stuff",
  "/problems": "Problems",
  "/daily-report": "Daily Report",
  "/billboard": "Billboard",
  "/transfer-list": "Transfer List",
  "/turnover-list": "Turnover List",
  "/roadside-inspection": "Roadside Inspection",
  "/eld": "ELD",
  "/live-oil-change": "Live Oil Change",
  "/live-oil-change/:truckId": "Truck Service Log",
  "/pretrip-inspection": "Pre Trip Inspection",
  "/truck-sales": "Truck Sales",
  "/info": "Info",
};

export const PageTitle = () => {
  const { pathname } = useLocation();

  useEffect(() => {
    const pageTitle = Object.entries(pageTitles).find(([path]) =>
      matchPath(path, pathname),
    )?.[1];

    document.title = `${pageTitle ?? "Page Not Found"} - ${appTitle}`;
  }, [pathname]);

  return null;
};
