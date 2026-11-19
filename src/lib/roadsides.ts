import type { UserRole } from "@/hooks/useAuth";
import type { Tables } from "@/integrations/supabase/types";

export const roadEditors: UserRole[] = ["admin", "maintenance", "safety"];
export const roadReaders: UserRole[] = [...roadEditors, "manager"];

export type Sheet = "ALL" | "Lawyers";
export type RoadRecord = Tables<"roadside_records">;
export type Column = { key: string; label: string; options?: string[]; multiline?: boolean };

const yesNo = ["Yes", "No"];
const companies = ["Beverly Freight", "BF PRIME", "BF PRIME UNITED", "Beverly Group", "BG Prime",
  "United Enterprise Solutions", "AP Silver Trans LLC", "Jones Freight Lines LLC"];
const reasons = ["tires", "light", "brakes", "overweight", "unsafe driving", "HOS Violation", "HOS Forms",
  "other", "CLEAN INSPECTION", "Failed But Not OOS", "maintenance", "accident", "suspension-air deflation", "USDOT inactive"];

export const columns: Record<Sheet, Column[]> = {
  ALL: [
    { key: "company", label: "Company", options: companies },
    { key: "truck", label: "Truck number" },
    { key: "driver", label: "Driver name" },
    { key: "trailer", label: "Trailer number" },
    { key: "inspection_date", label: "Inspection date" },
    { key: "oos", label: "OOS", options: ["YES", "CLEAN INSPECTION", "NO"] },
    { key: "reason", label: "Reason for violation", options: reasons },
    { key: "report", label: "Report sent to safety email", options: yesNo },
    { key: "mechanic", label: "Signed by mechanic", options: yesNo },
    { key: "receipt", label: "Receipt for repair", options: yesNo },
    { key: "logs", label: "Logs sent", options: yesNo },
    { key: "comment", label: "Comment", multiline: true },
  ],
  Lawyers: [
    { key: "driver", label: "Driver name" },
    { key: "truck", label: "Truck" },
    { key: "state", label: "State" },
    { key: "city", label: "City" },
    { key: "convictions", label: "Convictions", multiline: true },
    { key: "oos", label: "OOS" },
    { key: "returned", label: "Returned to" },
    { key: "lawyer", label: "Lawyer" },
    { key: "phone", label: "Phone" },
    { key: "address", label: "Address", multiline: true },
    { key: "assistant", label: "Assistant name" },
    { key: "court", label: "Court date" },
    { key: "company", label: "Company" },
    { key: "extra", label: "Additional notes", multiline: true },
  ],
};

export const highlightStyles: Record<string, string> = {
  green: "bg-green-100 dark:bg-green-950",
  red: "bg-red-100 dark:bg-red-950",
  blue: "bg-blue-100 dark:bg-blue-950",
  yellow: "bg-yellow-100 dark:bg-yellow-950",
};

export function webLink(value?: string) {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (["https:", "http:"].includes(url.protocol) && url.hostname.includes(".")) return url.href;
  } catch {
    // A few historical cells contain text in the hyperlink field.
  }
  return undefined;
}

export function displayValue(key: string, value = "") {
  if (key === "inspection_date" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-");
    return [month, day, year].join("/");
  }
  return value;
}
