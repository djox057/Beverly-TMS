import { useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { ChevronDown, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { ROW_COLORS } from "./DailyReportTable";

const colorBg = (c?: string | null) =>
  ROW_COLORS.find((x) => x.value === c)?.bg ?? "";

const officeDisplay = (office: string | null): string => {
  if (!office) return "—";
  return office === "CACAK" ? "ČAČAK" : office;
};

interface Row {
  id: string;
  date: string;
  office: string | null;
  truck: string | null;
  driver_name: string | null;
  note: string | null;
  home_date: string | null;
  color: string | null;
  created_at: string;
}

const fmtMMDD = (s: string | null | undefined) => {
  if (!s) return "";
  try {
    return format(parseISO(s), "MM/dd");
  } catch {
    return s;
  }
};

export const HomeTimeTable = ({ truckFilter }: { truckFilter?: string }) => {
  const [homeRows, setHomeRows] = useState<Row[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const homeRes = await supabase
        .from("daily_report_entries")
        .select(
          "id, date, office, truck, driver_name, note, home_date, color, created_at"
        )
        .eq("type", "Home")
        .not("driver_name", "is", null)
        .order("date", { ascending: false })
        .order("created_at", { ascending: true });
      if (cancelled) return;
      if (homeRes.error) console.error("home time home", homeRes.error);
      setHomeRows((homeRes.data ?? []) as Row[]);
    };
    load();
    const ch = supabase
      .channel(`daily_report_home_time:${Math.random().toString(36).slice(2)}`)
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
  }, []);

  const homeByDriver = useMemo(() => {
    const map = new Map<string, Row[]>();
    for (const r of homeRows) {
      const d = String(r.driver_name ?? "").trim();
      if (!d) continue;
      const arr = map.get(d) ?? [];
      arr.push(r);
      map.set(d, arr);
    }
    return map;
  }, [homeRows]);

  const drivers = useMemo(
    () => Array.from(homeByDriver.keys()).sort((a, b) => a.localeCompare(b)),
    [homeByDriver]
  );

  const filtered = useMemo(() => {
    const q = (truckFilter ?? "").trim().toLowerCase();
    if (!q) return drivers;
    return drivers.filter((d) => {
      if (d.toLowerCase().includes(q)) return true;
      const rows = homeByDriver.get(d) ?? [];
      return rows.some((r) =>
        String(r.truck ?? "").toLowerCase().includes(q)
      );
    });
  }, [drivers, homeByDriver, truckFilter]);

  const gridCols = "32px 70px 90px 140px 70px 1fr";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">
          Home time — {filtered.length} driver
          {filtered.length === 1 ? "" : "s"}
          {(truckFilter ?? "").trim() && (
            <span className="font-normal text-muted-foreground ml-1">
              (filtered)
            </span>
          )}
        </h2>
      </div>
      <div className="border border-border rounded-md overflow-hidden bg-card divide-y divide-border">
        {filtered.length === 0 && (
          <div className="p-4 text-center text-sm text-muted-foreground">
            No drivers found.
          </div>
        )}
        {filtered.map((driver) => {
          const isOpen = !!expanded[driver];
          const rows = homeByDriver.get(driver) ?? [];
          return (
            <div key={driver}>
              <button
                type="button"
                onClick={() =>
                  setExpanded((s) => ({ ...s, [driver]: !s[driver] }))
                }
                className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/60 transition-colors"
              >
                {isOpen ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                )}
                <span className="font-semibold text-sm text-foreground">
                  {driver}
                </span>
                <span className="ml-auto text-xs text-muted-foreground">
                  {rows.length} Home row{rows.length === 1 ? "" : "s"}
                </span>
              </button>
              {isOpen && (
                <div className="border-t border-border bg-background">
                  <>
                      <div
                        className="grid bg-muted/40 text-xs font-medium text-muted-foreground border-b border-border"
                        style={{ gridTemplateColumns: gridCols }}
                      >
                        <div className="px-1 py-1.5 border-r border-border text-center font-light text-foreground/80">
                          #
                        </div>
                        <div className="px-2 py-1.5 border-r border-border">
                          Date
                        </div>
                        <div className="px-2 py-1.5 border-r border-border">
                          Truck#
                        </div>
                        <div className="px-2 py-1.5 border-r border-border">
                          Office
                        </div>
                        <div className="px-2 py-1.5 border-r border-border">
                          Home date
                        </div>
                        <div className="px-2 py-1.5">Note</div>
                      </div>
                      <div className="divide-y divide-border">
                        {rows.map((r, i) => (
                          <div
                            key={r.id}
                            className={cn("grid text-sm", colorBg(r.color))}
                            style={{ gridTemplateColumns: gridCols }}
                          >
                            <div className="px-1 py-1.5 border-r border-border text-center text-xs font-light text-foreground/80">
                              {i + 1}
                            </div>
                            <div className="px-2 py-1.5 border-r border-border truncate">
                              {fmtMMDD(r.date)}
                            </div>
                            <div className="px-2 py-1.5 border-r border-border truncate">
                              {r.truck ?? ""}
                            </div>
                            <div className="px-2 py-1.5 border-r border-border truncate">
                              {officeDisplay(r.office)}
                            </div>
                            <div className="px-2 py-1.5 border-r border-border truncate">
                              {fmtMMDD(r.home_date)}
                            </div>
                            <div className="px-2 py-1.5 whitespace-pre-wrap break-words">
                              {r.note ?? ""}
                            </div>
                          </div>
                        ))}
                      </div>
                  </>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default HomeTimeTable;