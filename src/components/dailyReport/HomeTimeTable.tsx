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
  note: string | null;
  home_date: string | null;
  color: string | null;
  created_at: string;
}

interface AnyRow {
  truck: string | null;
}

export const HomeTimeTable = ({ truckFilter }: { truckFilter?: string }) => {
  const [trucks, setTrucks] = useState<string[]>([]);
  const [homeRows, setHomeRows] = useState<Row[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const [allRes, homeRes] = await Promise.all([
        supabase
          .from("daily_report_entries")
          .select("truck")
          .not("truck", "is", null),
        supabase
          .from("daily_report_entries")
          .select("id, date, office, truck, note, home_date, color, created_at")
          .eq("type", "Home")
          .not("truck", "is", null)
          .order("date", { ascending: false })
          .order("created_at", { ascending: true }),
      ]);
      if (cancelled) return;
      if (allRes.error) console.error("home time all", allRes.error);
      if (homeRes.error) console.error("home time home", homeRes.error);
      const set = new Set<string>();
      for (const r of (allRes.data ?? []) as AnyRow[]) {
        const t = String(r.truck ?? "").trim();
        if (t) set.add(t);
      }
      setTrucks(
        Array.from(set).sort((a, b) => {
          const na = Number(a);
          const nb = Number(b);
          if (!isNaN(na) && !isNaN(nb)) return na - nb;
          return a.localeCompare(b);
        })
      );
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

  const homeByTruck = useMemo(() => {
    const map = new Map<string, Row[]>();
    for (const r of homeRows) {
      const t = String(r.truck ?? "").trim();
      if (!t) continue;
      const arr = map.get(t) ?? [];
      arr.push(r);
      map.set(t, arr);
    }
    return map;
  }, [homeRows]);

  const filtered = useMemo(() => {
    const q = (truckFilter ?? "").trim().toLowerCase();
    if (!q) return trucks;
    return trucks.filter((t) => t.toLowerCase().includes(q));
  }, [trucks, truckFilter]);

  const gridCols = "32px 110px 140px 90px 1fr";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-foreground">
          Home time — {filtered.length} truck{filtered.length === 1 ? "" : "s"}
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
            No trucks found.
          </div>
        )}
        {filtered.map((truck) => {
          const isOpen = !!expanded[truck];
          const rows = homeByTruck.get(truck) ?? [];
          return (
            <div key={truck}>
              <button
                type="button"
                onClick={() =>
                  setExpanded((s) => ({ ...s, [truck]: !s[truck] }))
                }
                className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/60 transition-colors"
              >
                {isOpen ? (
                  <ChevronDown className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                )}
                <span className="font-semibold text-sm text-foreground">
                  Truck #{truck}
                </span>
                <span className="ml-auto text-xs text-muted-foreground">
                  {rows.length} Home row{rows.length === 1 ? "" : "s"}
                </span>
              </button>
              {isOpen && (
                <div className="border-t border-border bg-background">
                  {rows.length === 0 ? (
                    <div className="p-3 text-xs text-muted-foreground">
                      No Home rows for this truck.
                    </div>
                  ) : (
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
                              {(() => {
                                try {
                                  return format(
                                    parseISO(r.date),
                                    "EEE, MM/dd/yyyy"
                                  );
                                } catch {
                                  return r.date;
                                }
                              })()}
                            </div>
                            <div className="px-2 py-1.5 border-r border-border truncate">
                              {officeDisplay(r.office)}
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
                    </>
                  )}
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