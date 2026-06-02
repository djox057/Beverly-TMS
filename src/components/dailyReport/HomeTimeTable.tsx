import { useEffect, useMemo, useState } from "react";
import { format, parseISO } from "date-fns";
import { toZonedTime } from "date-fns-tz";
import { ChevronDown, ChevronRight } from "lucide-react";
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
import { DateRangePicker } from "@/components/ui/date-range-picker";
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

const CHICAGO_TZ = "America/Chicago";

const toChicagoDateStr = (d: Date) =>
  format(toZonedTime(d, CHICAGO_TZ), "yyyy-MM-dd");

// Monday-start week, weeksAgo=0 -> current week
const getWeekStartDate = (weeksAgo: number) => {
  const today = new Date();
  const dayOfWeek = today.getDay();
  const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const weekStart = new Date(today);
  weekStart.setDate(today.getDate() - diff - weeksAgo * 7);
  weekStart.setHours(0, 0, 0, 0);
  return weekStart;
};

const generateWeekOptions = () => {
  const weeks: { value: string; label: string }[] = [];
  const fmt = (d: Date) =>
    d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  for (let i = -1; i < 52; i++) {
    const start = getWeekStartDate(i);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    weeks.push({
      value: i.toString(),
      label:
        i === -1 ? "Next Week" :
        i === 0 ? "This Week" :
        i === 1 ? "Last Week" :
        `${fmt(start)} - ${fmt(end)}`,
    });
  }
  return weeks;
};

const generateMonthOptions = () => {
  const months: { value: string; label: string; start: Date; end: Date }[] = [];
  const today = new Date();
  for (let i = -1; i < 12; i++) {
    const monthDate = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const start = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
    const end = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);
    months.push({
      value: `${monthDate.getFullYear()}-${String(monthDate.getMonth() + 1).padStart(2, "0")}`,
      label: start.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
      start,
      end,
    });
  }
  return months;
};

export const HomeTimeTable = ({ truckFilter }: { truckFilter?: string }) => {
  const [homeRows, setHomeRows] = useState<Row[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [selectedWeek, setSelectedWeek] = useState<string>("all");
  const [selectedMonth, setSelectedMonth] = useState<string>("all");
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);

  const weekOptions = useMemo(() => generateWeekOptions(), []);
  const monthOptions = useMemo(() => generateMonthOptions(), []);

  const handleWeekChange = (value: string) => {
    setSelectedWeek(value);
    setSelectedMonth("all");
    if (value === "all") {
      setDateRange(undefined);
    } else {
      const start = getWeekStartDate(parseInt(value));
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      end.setHours(23, 59, 59, 999);
      setDateRange({ from: start, to: end });
    }
  };

  const handleMonthChange = (value: string) => {
    setSelectedMonth(value);
    setSelectedWeek("all");
    if (value === "all") {
      setDateRange(undefined);
    } else {
      const m = monthOptions.find((x) => x.value === value);
      if (m) setDateRange({ from: m.start, to: m.end });
    }
  };

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
    // Compute date range (Chicago) from the active selection.
    let fromStr: string | null = null;
    let toStr: string | null = null;
    if (dateRange?.from) fromStr = toChicagoDateStr(dateRange.from);
    if (dateRange?.to) toStr = toChicagoDateStr(dateRange.to);
    else if (dateRange?.from) toStr = fromStr;

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
  }, [homeRows, dateRange]);

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
        <div className="flex flex-col sm:flex-row flex-wrap gap-2 items-stretch sm:items-center">
          <Select value={selectedWeek} onValueChange={handleWeekChange}>
            <SelectTrigger className="w-full sm:w-56">
              <SelectValue placeholder="All time weekly" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All time weekly</SelectItem>
              {weekOptions.map((w) => (
                <SelectItem key={w.value} value={w.value}>
                  {w.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={selectedMonth} onValueChange={handleMonthChange}>
            <SelectTrigger className="w-full sm:w-56">
              <SelectValue placeholder="All time monthly" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All time monthly</SelectItem>
              {monthOptions.map((m) => (
                <SelectItem key={m.value} value={m.value}>
                  {m.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <DateRangePicker
            date={dateRange}
            onDateChange={(range) => {
              setDateRange(range);
              setSelectedWeek("all");
              setSelectedMonth("all");
            }}
            placeholder="Custom date range"
            className="w-full sm:w-64"
          />

          {dateRange && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setDateRange(undefined);
                setSelectedWeek("all");
                setSelectedMonth("all");
              }}
            >
              Clear Filter
            </Button>
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