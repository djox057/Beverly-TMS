import { useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { ROW_COLORS } from "./DailyReportTable";

const colorBg = (c?: string | null) =>
  ROW_COLORS.find((x) => x.value === c)?.bg ?? "";

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

const officeKey = (office: string | null, type: string): string =>
  office ?? TYPE_AS_OFFICE[type] ?? type;

const SECTION_LABELS: Record<string, string> = {
  "Empty & Late for delivery": "Empty & Late",
  Home: "Home",
};

interface Row {
  id: string;
  date: string;
  type: string;
  office: string | null;
  truck: string | null;
  note: string | null;
  home_date: string | null;
  color: string | null;
  created_at: string;
}

export const TruckSearchAllOfficesTable = ({
  truckQuery,
}: {
  truckQuery: string;
}) => {
  const [rows, setRows] = useState<Row[]>([]);
  const q = truckQuery.trim();

  useEffect(() => {
    if (!q) {
      setRows([]);
      return;
    }
    let cancelled = false;
    const load = async () => {
      const { data, error } = await supabase
        .from("daily_report_entries")
        .select("id, date, type, office, truck, note, home_date, color, created_at")
        .ilike("truck", `%${q}%`)
        .order("date", { ascending: false })
        .order("office", { ascending: true })
        .order("type", { ascending: true })
        .order("created_at", { ascending: true });
      if (cancelled) return;
      if (error) {
        console.error("truck search load", error);
        return;
      }
      setRows((data ?? []) as Row[]);
    };
    load();

    const ch = supabase
      .channel(`daily_report_truck_search:${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "daily_report_entries" },
        () => load()
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
    };
  }, [q]);

  // Group by office (label) then by date.
  const grouped = useMemo(() => {
    const officeMap = new Map<
      string,
      { label: string; dateMap: Map<string, Row[]> }
    >();
    for (const r of rows) {
      const key = officeKey(r.office, r.type);
      const label = officeDisplay(r.office, r.type);
      let entry = officeMap.get(key);
      if (!entry) {
        entry = { label, dateMap: new Map() };
        officeMap.set(key, entry);
      }
      const dList = entry.dateMap.get(r.date) ?? [];
      dList.push(r);
      entry.dateMap.set(r.date, dList);
    }
    return Array.from(officeMap.entries())
      .sort((a, b) => a[1].label.localeCompare(b[1].label))
      .map(([key, val]) => ({
        key,
        label: val.label,
        dates: Array.from(val.dateMap.entries())
          .sort((a, b) => (a[0] < b[0] ? 1 : -1))
          .map(([date, items]) => ({ date, items })),
      }));
  }, [rows]);

  const gridCols = "32px 110px 140px 90px 1fr";

  return (
    <div className="space-y-4">
      {grouped.length === 0 && (
        <div className="border border-border rounded-md p-6 text-center text-sm text-muted-foreground bg-card">
          No rows found for truck "{q}"
        </div>
      )}
      {grouped.map((office) => (
        <div
          key={office.key}
          className="border border-border rounded-md overflow-hidden bg-card"
        >
          <div className="px-3 py-2 bg-primary/10 text-sm font-bold uppercase tracking-wide text-foreground border-b border-border">
            {office.label}
          </div>
          {office.dates.map(({ date, items }) => (
            <div key={date} className="border-b border-border last:border-b-0">
              <div className="px-3 py-1.5 bg-muted text-xs font-semibold text-foreground border-b border-border">
                {(() => {
                  try {
                    return format(parseISO(date), "EEE, MM/dd/yyyy");
                  } catch {
                    return date;
                  }
                })()}
              </div>
              <div
                className="grid bg-muted/40 text-xs font-medium text-muted-foreground border-b border-border"
                style={{ gridTemplateColumns: gridCols }}
              >
                <div className="px-1 py-1.5 border-r border-border text-center font-light text-foreground/80">
                  #
                </div>
                <div className="px-2 py-1.5 border-r border-border">Truck#</div>
                <div className="px-2 py-1.5 border-r border-border">Section</div>
                <div className="px-2 py-1.5 border-r border-border">Home date</div>
                <div className="px-2 py-1.5">Note</div>
              </div>
              <div className="divide-y divide-border">
                {items.map((r, i) => (
                  <div
                    key={r.id}
                    className={cn("grid text-sm", colorBg(r.color))}
                    style={{ gridTemplateColumns: gridCols }}
                  >
                    <div className="px-1 py-1.5 border-r border-border text-center text-xs font-light text-foreground/80">
                      {i + 1}
                    </div>
                    <div className="px-2 py-1.5 border-r border-border truncate">
                      {r.truck ?? ""}
                    </div>
                    <div className="px-2 py-1.5 border-r border-border truncate">
                      {SECTION_LABELS[r.type] ?? r.type}
                    </div>
                    <div className="px-2 py-1.5 border-r border-border truncate">
                      {r.home_date ?? ""}
                    </div>
                    <div className="px-2 py-1.5 whitespace-pre-wrap break-words">
                      {r.note ?? ""}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
};

export default TruckSearchAllOfficesTable;