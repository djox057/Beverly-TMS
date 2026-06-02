import { useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { CalendarIcon, ChevronDown, ChevronRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { ROW_COLORS } from "./DailyReportTable";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { DateRange } from "react-day-picker";

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

type DateMode = "all" | "weekly" | "monthly" | "custom";

const CHICAGO_TZ = "America/Chicago";

const toChicagoDateStr = (d: Date) =>
  format(toZonedTime(d, CHICAGO_TZ), "yyyy-MM-dd");

export const HomeTimeTable = ({ truckFilter }: { truckFilter?: string }) => {
  const [homeRows, setHomeRows] = useState<Row[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [dateMode, setDateMode] = useState<DateMode>("all");
  const [customRange, setCustomRange] = useState<DateRange | undefined>(undefined);

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
    // Compute date range based on selected mode (Chicago time).
    const todayStr = toChicagoDateStr(new Date());
    let fromStr: string | null = null;
    let toStr: string | null = null;
    if (dateMode === "weekly") {
      const d = new Date();
      d.setDate(d.getDate() - 6);
      fromStr = toChicagoDateStr(d);
      toStr = todayStr;
    } else if (dateMode === "monthly") {
      const d = new Date();
      d.setDate(d.getDate() - 29);
      fromStr = toChicagoDateStr(d);
      toStr = todayStr;
    } else if (dateMode === "custom") {
      if (customRange?.from) fromStr = toChicagoDateStr(customRange.from);
      if (customRange?.to) toStr = toChicagoDateStr(customRange.to);
      else if (customRange?.from) toStr = fromStr;
    }

    const inRange = (r: Row) => {
      if (!fromStr && !toStr) return true;
      const d = r.date;
      if (!d) return false;
      if (fromStr && d < fromStr) return false;
      if (toStr && d > toStr) return false;
      return true;
    };

    const map = new Map<string, Row[]>();
    for (const r of homeRows) {
      const d = String(r.driver_name ?? "").trim();
      if (!d) continue;
      if (!inRange(r)) continue;
      const arr = map.get(d) ?? [];
      arr.push(r);
      map.set(d, arr);
    }
    return map;
  }, [homeRows, dateMode, customRange]);

  const drivers = useMemo(
    () =>
      Array.from(homeByDriver.keys()).sort((a, b) => {
        const diff =
          (homeByDriver.get(b)?.length ?? 0) -
          (homeByDriver.get(a)?.length ?? 0);
        return diff !== 0 ? diff : a.localeCompare(b);
      }),
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
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-sm font-semibold text-foreground">
          Home time — {filtered.length} driver
          {filtered.length === 1 ? "" : "s"}
          {(truckFilter ?? "").trim() && (
            <span className="font-normal text-muted-foreground ml-1">
              (filtered)
            </span>
          )}
        </h2>
        <div className="flex items-center gap-2">
          <Select
            value={dateMode}
            onValueChange={(v) => setDateMode(v as DateMode)}
          >
            <SelectTrigger className="h-8 w-[160px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All time</SelectItem>
              <SelectItem value="weekly">Weekly (last 7d)</SelectItem>
              <SelectItem value="monthly">Monthly (last 30d)</SelectItem>
              <SelectItem value="custom">Custom range</SelectItem>
            </SelectContent>
          </Select>
          {dateMode === "custom" && (
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className={cn(
                    "h-8 text-xs justify-start font-normal",
                    !customRange?.from && "text-muted-foreground"
                  )}
                >
                  <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                  {customRange?.from
                    ? customRange.to
                      ? `${format(customRange.from, "MM/dd/yy")} – ${format(customRange.to, "MM/dd/yy")}`
                      : format(customRange.from, "MM/dd/yy")
                    : "Pick a range"}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="end">
                <Calendar
                  mode="range"
                  selected={customRange}
                  onSelect={setCustomRange}
                  numberOfMonths={2}
                  initialFocus
                  className={cn("p-3 pointer-events-auto")}
                />
              </PopoverContent>
            </Popover>
          )}
        </div>
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