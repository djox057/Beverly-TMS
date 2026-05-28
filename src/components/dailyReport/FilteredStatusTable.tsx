import { useEffect, useState } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { ROW_COLORS } from "./DailyReportTable";

const colorBg = (c?: string | null) =>
  ROW_COLORS.find((x) => x.value === c)?.bg ?? "";

const SECTION_LABELS: Record<string, string> = {
  "Empty & Late for delivery": "Empty & Late",
  Home: "Home",
};

// Types without an office act as their own "office" group.
const TYPE_AS_OFFICE: Record<string, string> = {
  Maintenance: "Maintenance",
  Afterhours: "Afterhours",
  Recoveries: "Recoveries",
  "New driver": "New driver",
  Safety: "Safety",
};

const officeDisplay = (office: string | null, type: string): string => {
  if (office) return office === "CACAK" ? "ČAČAK" : office;
  return TYPE_AS_OFFICE[type] ?? type;
};

interface Row {
  id: string;
  type: string;
  office: string | null;
  truck: string | null;
  note: string | null;
  home_date: string | null;
  color: string | null;
  created_at: string;
}

export const FilteredStatusTable = ({
  date,
  colorFilter,
  filterLabel,
  truckFilter = "",
}: {
  date: Date;
  colorFilter: string;
  filterLabel: string;
  truckFilter?: string;
}) => {
  const [rows, setRows] = useState<Row[]>([]);
  const dateStr = format(date, "yyyy-MM-dd");

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      let q = supabase
        .from("daily_report_entries")
        .select("id, type, office, truck, note, home_date, color, created_at")
        .eq("date", dateStr);
      if (colorFilter === "home_time") {
        q = q.eq("type", "Home");
      } else {
        q = q.eq("color", colorFilter).neq("type", "Home");
      }
      const { data, error } = await q
        .order("office", { ascending: true })
        .order("type", { ascending: true })
        .order("created_at", { ascending: true });
      if (error) {
        console.error("filtered status load", error);
        return;
      }
      if (!cancelled) setRows((data ?? []) as Row[]);
    };
    load();

    const ch = supabase
      .channel(`daily_report_filter:${dateStr}:${colorFilter}:${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "daily_report_entries", filter: `date=eq.${dateStr}` },
        () => load()
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
    };
  }, [dateStr, colorFilter]);

  const showDate = colorFilter === "home_time";
  const gridCols = showDate
    ? "160px 110px 90px 1fr"
    : "160px 110px 1fr";

  return (
    <div className="border border-border rounded-md overflow-hidden bg-card">
      <div className="px-3 py-2 bg-muted text-xs font-semibold uppercase tracking-wide text-foreground border-b border-border">
        Filter: {filterLabel}
      </div>
      <div
        className="grid bg-muted/50 text-xs font-medium text-muted-foreground border-b border-border"
        style={{ gridTemplateColumns: gridCols }}
      >
        <div className="px-2 py-1.5 border-r border-border">Office</div>
        <div className="px-2 py-1.5 border-r border-border">Truck#</div>
        {showDate && (
          <div className="px-2 py-1.5 border-r border-border">Date</div>
        )}
        <div className="px-2 py-1.5">Note</div>
      </div>
      <div className="divide-y divide-border">
        {visible.length === 0 && (
          <div className="px-3 py-4 text-xs text-muted-foreground text-center">
            No matching rows
          </div>
        )}
        {visible.map((r) => (
          <div
            key={r.id}
            className={cn("grid text-sm", colorBg(r.color))}
            style={{ gridTemplateColumns: gridCols }}
          >
            <div className="px-2 py-1.5 border-r border-border truncate font-medium">
              {officeDisplay(r.office, r.type)}
            </div>
            <div className="px-2 py-1.5 border-r border-border truncate">
              {r.truck ?? ""}
            </div>
            {showDate && (
              <div className="px-2 py-1.5 border-r border-border truncate">
                {r.home_date ?? ""}
              </div>
            )}
            <div className="px-2 py-1.5 truncate">{r.note ?? ""}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default FilteredStatusTable;