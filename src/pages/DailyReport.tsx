import { useEffect, useMemo, useState } from "react";
import { format, addDays } from "date-fns";
import { CalendarIcon, ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DailyReportTable, ROW_COLORS, type DailyReportColumn } from "@/components/dailyReport/DailyReportTable";
import { FilteredStatusTable } from "@/components/dailyReport/FilteredStatusTable";
import { ExportDailyReportPdf } from "@/components/dailyReport/ExportDailyReportPdf";
import { cn } from "@/lib/utils";
import { Info, PaintBucket, Maximize2, HelpCircle } from "lucide-react";
import { getChicagoToday } from "@/pages/Reports/helpers";
import { useDailyReportPermissions } from "@/hooks/useDailyReportPermissions";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

const OFFICES = ["CACAK", "KRAGUJEVAC", "BG 1st FLOOR", "BG 4th FLOOR"] as const;

// Display label for an office code (DB still stores the original value).
export const officeLabel = (o: string | null | undefined): string => {
  if (!o) return "";
  if (o === "CACAK") return "ČAČAK";
  return o;
};

const COLOR_FILTERS = [
  { value: "orange", label: "Late" },
  { value: "cyan", label: "No load" },
  { value: "yellow", label: "Problem" },
  { value: "red", label: "Recovery" },
  { value: "green", label: "Resolved" },
  { value: "home_time", label: "Home time" },
] as const;

const typeToTab = (type: string, office: string | null): string | null => {
  if (office) return office;
  if (type === "Maintenance") return "MAINTENANCE";
  if (type === "Afterhours") return "AFTERHOURS";
  if (type === "Recoveries") return "RECOVERIES";
  if (type === "New driver") return "NEW_DRIVER";
  if (type === "Safety") return "SAFETY";
  return null;
};

const EMPTY_LATE_COLS: DailyReportColumn[] = [
  { key: "truck", label: "Truck#", width: "110px", autocompleteTrucks: true },
  { key: "note", label: "Note", width: "1fr" },
];

const HOME_COLS: DailyReportColumn[] = [
  { key: "truck", label: "Truck#", width: "88px", autocompleteTrucks: true },
  { key: "home_date", label: "Date", width: "82px", mmddDate: true },
  { key: "note", label: "Note", width: "1fr" },
];

const WIDE_NOTE_COLS: DailyReportColumn[] = [
  { key: "truck", label: "Truck#", width: "110px", autocompleteTrucks: true },
  { key: "note", label: "Note", width: "1fr" },
];

const OfficeTab = ({
  office,
  date,
  readOnly,
  truckFilter,
  colorFilter,
}: {
  office: string;
  date: Date;
  readOnly: boolean;
  truckFilter: string;
  colorFilter: string | null;
}) => {
  return (
  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
    <DailyReportTable
      title={`${officeLabel(office)} — Empty & Late for delivery`}
      columns={EMPTY_LATE_COLS}
      initialRows={10}
      date={date}
      office={office}
      type="Empty & Late for delivery"
      readOnly={readOnly}
      truckFilter={truckFilter}
      colorFilter={colorFilter}
    />
    <DailyReportTable
      title={`${officeLabel(office)} — Home`}
      columns={HOME_COLS}
      initialRows={10}
      date={date}
      office={office}
      type="Home"
      readOnly={readOnly}
      truckFilter={truckFilter}
      colorFilter={colorFilter}
    />
  </div>
  );
};

const DailyReport = () => {
  const [date, setDate] = useState<Date>(() => getChicagoToday());
  const [activeTab, setActiveTab] = useState<string>("CACAK");
  const [prevTab, setPrevTab] = useState<string>("CACAK");
  const { canView, canEdit, loading } = useDailyReportPermissions();
  const [truckQuery, setTruckQuery] = useState("");
  const [colorFilter, setColorFilter] = useState<string | null>(null);
  const [matchByDate, setMatchByDate] = useState<Map<string, string>>(new Map());

  // When a status filter is active, switch to a hidden combined tab and
  // remember the user's prior tab so we can restore it on clear.
  useEffect(() => {
    if (colorFilter) {
      if (activeTab !== "__FILTER") {
        setPrevTab(activeTab);
        setActiveTab("__FILTER");
      }
    } else {
      if (activeTab === "__FILTER") {
        setActiveTab(prevTab || "CACAK");
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [colorFilter]);

  // When truck query is set, fetch all dates/offices where this truck appears
  useEffect(() => {
    const q = truckQuery.trim();
    if (!q) {
      setMatchByDate(new Map());
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("daily_report_entries")
        .select("date, office, type, truck")
        .ilike("truck", `%${q}%`);
      if (cancelled || error || !data) return;
      const map = new Map<string, string>();
      for (const r of data as any[]) {
        const tab = typeToTab(r.type, r.office ?? null);
        if (!tab || !r.date) continue;
        if (!map.has(r.date)) map.set(r.date, tab);
      }
      setMatchByDate(map);
    })();
    return () => {
      cancelled = true;
    };
  }, [truckQuery]);

  // Auto-switch tab when the selected date has the matching truck in another office
  useEffect(() => {
    if (!truckQuery.trim()) return;
    const key = format(date, "yyyy-MM-dd");
    const tab = matchByDate.get(key);
    if (tab && tab !== activeTab) setActiveTab(tab);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, matchByDate, truckQuery]);

  const dateDisabled = useMemo(() => {
    if (!truckQuery.trim()) return undefined;
    return (d: Date) => !matchByDate.has(format(d, "yyyy-MM-dd"));
  }, [truckQuery, matchByDate]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!canView) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <h2 className="text-xl font-semibold text-destructive mb-2">Access Denied</h2>
          <p className="text-muted-foreground">
            You don't have permission to view the Beverly Daily Report.
          </p>
        </div>
      </div>
    );
  }

  const readOnly = !canEdit;

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-[1600px] mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold text-foreground">Beverly Daily Report</h1>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Legend">
                <HelpCircle className="h-4 w-4 text-muted-foreground" />
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-80 p-4 text-xs space-y-3">
              <div>
                <div className="font-semibold text-sm mb-2 text-foreground">Row colors</div>
                <div className="space-y-1.5">
                  {ROW_COLORS.map((c) => (
                    <div key={c.value} className="flex items-center gap-2">
                      <span className={cn("h-4 w-4 rounded-sm border border-border", c.swatch)} />
                      <span className="text-foreground">{c.label}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div className="border-t border-border pt-3">
                <div className="font-semibold text-sm mb-2 text-foreground">Page controls</div>
                <ul className="space-y-1.5 text-muted-foreground">
                  <li><span className="text-foreground font-medium">Search truck #</span> — filters all tabs to rows for that truck and auto-switches to the office where it appears for the selected date.</li>
                  <li><span className="text-foreground font-medium">Filter status</span> — shows only rows colored with the chosen status.</li>
                  <li><span className="text-foreground font-medium">Calendar</span> — when searching by truck, dates without a match are greyed out.</li>
                </ul>
              </div>
              <div className="border-t border-border pt-3">
                <div className="font-semibold text-sm mb-2 text-foreground">Row icons</div>
                <ul className="space-y-1.5 text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <span>Shows the assigned driver and dispatcher for the truck.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <Maximize2 className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <span>Opens the note in a larger window to read or edit long text.</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <PaintBucket className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                    <span>Sets the row status color (Late, No load, Problem, Recovery, Resolved).</span>
                  </li>
                </ul>
              </div>
            </PopoverContent>
          </Popover>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="h-3.5 w-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={truckQuery}
              onChange={(e) => setTruckQuery(e.target.value)}
              placeholder="Search truck #"
              className="h-9 w-44 pl-7 pr-7 text-sm"
            />
            {truckQuery && (
              <button
                type="button"
                onClick={() => setTruckQuery("")}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                aria-label="Clear search"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <Select
            value={colorFilter ?? "__all"}
            onValueChange={(v) => setColorFilter(v === "__all" ? null : v)}
          >
            <SelectTrigger className="h-9 w-36 text-sm">
              <SelectValue placeholder="Filter status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">All statuses</SelectItem>
              {COLOR_FILTERS.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {c.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="icon"
            onClick={() => setDate((d) => addDays(d, -1))}
            aria-label="Previous day"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className="font-normal px-3">
                <CalendarIcon className="mr-2 h-4 w-4" />
                {format(date, "MM/dd/yyyy")}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="single"
                selected={date}
                onSelect={(d) => d && setDate(d)}
                initialFocus
                className={cn("p-3 pointer-events-auto")}
                disabled={dateDisabled}
              />
            </PopoverContent>
          </Popover>
          <Button
            variant="outline"
            size="icon"
            onClick={() => setDate((d) => addDays(d, 1))}
            aria-label="Next day"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          </div>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4 sm:grid-cols-9 h-auto gap-1 p-1">
          {OFFICES.map((o) => (
            <TabsTrigger
              key={o}
              value={o}
              className="w-full text-xs sm:text-sm font-semibold py-2 whitespace-normal leading-tight"
            >
              {officeLabel(o)}
            </TabsTrigger>
          ))}
          <TabsTrigger value="MAINTENANCE" className="w-full text-xs sm:text-sm font-semibold py-2 whitespace-normal leading-tight">
            Maintenance
          </TabsTrigger>
          <TabsTrigger value="AFTERHOURS" className="w-full text-xs sm:text-sm font-semibold py-2 whitespace-normal leading-tight">
            Afterhours
          </TabsTrigger>
          <TabsTrigger value="RECOVERIES" className="w-full text-xs sm:text-sm font-semibold py-2 whitespace-normal leading-tight">
            Recoveries
          </TabsTrigger>
          <TabsTrigger value="NEW_DRIVER" className="w-full text-xs sm:text-sm font-semibold py-2 whitespace-normal leading-tight">
            New driver
          </TabsTrigger>
          <TabsTrigger value="SAFETY" className="w-full text-xs sm:text-sm font-semibold py-2 whitespace-normal leading-tight">
            Safety
          </TabsTrigger>
        </TabsList>

        {/* Hidden combined view shown only while a status filter is active */}
        <TabsContent value="__FILTER" className="mt-4">
          {colorFilter && (
            <FilteredStatusTable
              date={date}
              colorFilter={colorFilter}
              filterLabel={
                COLOR_FILTERS.find((c) => c.value === colorFilter)?.label ??
                colorFilter
              }
              truckFilter={truckQuery}
            />
          )}
        </TabsContent>

        {OFFICES.map((o) => (
          <TabsContent key={o} value={o} className="mt-4">
            <OfficeTab
              office={o}
              date={date}
              readOnly={readOnly}
              truckFilter={truckQuery}
              colorFilter={colorFilter}
            />
          </TabsContent>
        ))}

        <TabsContent value="MAINTENANCE" className="mt-4">
          <DailyReportTable
            title="Maintenance"
            columns={WIDE_NOTE_COLS}
            initialRows={10}
            date={date}
            type="Maintenance"
            readOnly={readOnly}
            truckFilter={truckQuery}
            colorFilter={colorFilter}
          />
        </TabsContent>
        <TabsContent value="AFTERHOURS" className="mt-4">
          <DailyReportTable
            title="After Hours"
            columns={WIDE_NOTE_COLS}
            initialRows={10}
            date={date}
            type="Afterhours"
            readOnly={readOnly}
            truckFilter={truckQuery}
            colorFilter={colorFilter}
          />
        </TabsContent>
        <TabsContent value="RECOVERIES" className="mt-4">
          <DailyReportTable
            title="Recoveries"
            columns={WIDE_NOTE_COLS}
            initialRows={10}
            date={date}
            type="Recoveries"
            readOnly={readOnly}
            truckFilter={truckQuery}
            colorFilter={colorFilter}
          />
        </TabsContent>
        <TabsContent value="NEW_DRIVER" className="mt-4">
          <DailyReportTable
            title="New driver"
            columns={WIDE_NOTE_COLS}
            initialRows={10}
            date={date}
            type="New driver"
            readOnly={readOnly}
            truckFilter={truckQuery}
            colorFilter={colorFilter}
          />
        </TabsContent>
        <TabsContent value="SAFETY" className="mt-4">
          <DailyReportTable
            title="Safety"
            columns={WIDE_NOTE_COLS}
            initialRows={10}
            date={date}
            type="Safety"
            readOnly={readOnly}
            truckFilter={truckQuery}
            colorFilter={colorFilter}
          />
        </TabsContent>
      </Tabs>
      <ExportDailyReportPdf date={date} />
    </div>
  );
};

export default DailyReport;