import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Search, ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { ComplaintCard } from "@/components/complaints/ComplaintCard";
import {
  COMPLAINT_GROUPS,
  COMPLAINT_TYPE_LABELS,
  DISPATCHER_REPORTING,
  type ComplaintTypeKey,
  type DriverComplaint,
} from "@/components/complaints/complaintTypes";
import { Badge } from "@/components/ui/badge";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Combobox } from "@/components/ui/combobox";
import { ComplaintComments } from "@/components/complaints/ComplaintComments";
import { useAuthContext } from "@/contexts/AuthContext";

// --- Chicago week helpers (Mon–Sun) ---
const chicagoDateKey = (d: Date) =>
  d.toLocaleDateString("en-CA", { timeZone: "America/Chicago" });

const keyToDate = (key: string) => new Date(`${key}T12:00:00Z`);

const weekStartKey = (key: string) => {
  const d = keyToDate(key);
  const dow = d.getUTCDay(); // 0 = Sun
  const diff = dow === 0 ? 6 : dow - 1;
  d.setUTCDate(d.getUTCDate() - diff);
  return d.toISOString().slice(0, 10);
};

const addDaysKey = (key: string, days: number) => {
  const d = keyToDate(key);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

const prettyKey = (key: string) =>
  keyToDate(key).toLocaleDateString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
  });

const chicagoDayLabel = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", {
    timeZone: "America/Chicago",
    weekday: "short",
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  });

const chicagoTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-US", {
    timeZone: "America/Chicago",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

const DriversComplaints = () => {
  const { hasRole, user } = useAuthContext();
  const canManage = hasRole("admin") || hasRole("manager");
  const isDispatchOnly = !canManage && hasRole("dispatch");
  const groups = useMemo(
    () =>
      isDispatchOnly
        ? COMPLAINT_GROUPS.filter((g) => g.types.includes(DISPATCHER_REPORTING))
        : COMPLAINT_GROUPS,
    [isDispatchOnly],
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [groupIndex, setGroupIndex] = useState(0);
  const [direction, setDirection] = useState<"left" | "right">("right");
  const currentWeek = weekStartKey(chicagoDateKey(new Date()));
  const [weekStart, setWeekStart] = useState(currentWeek);
  const [customRange, setCustomRange] = useState<{ from: string; to: string | null } | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [companyFilter, setCompanyFilter] = useState("");
  const [dispatcherFilter, setDispatcherFilter] = useState("");
  const [officeFilter, setOfficeFilter] = useState("");

  const rangeStart = customRange ? customRange.from : weekStart;
  const rangeEnd = customRange ? customRange.to ?? customRange.from : addDaysKey(weekStart, 6);

  const shiftWeek = (delta: number) => {
    setCustomRange(null);
    setWeekStart((w) => addDaysKey(customRange ? weekStartKey(customRange.from) : w, delta));
  };

  const goGroup = (delta: number) => {
    setDirection(delta > 0 ? "right" : "left");
    setGroupIndex((i) => (i + delta + groups.length) % groups.length);
  };

  const { data: complaints = [], isLoading } = useQuery({
    queryKey: ["driver-complaints", isDispatchOnly ? user?.id : "all"],
    queryFn: async () => {
      let query = supabase
        .from("driver_complaints")
        .select("*")
        .order("created_at", { ascending: false });
      if (isDispatchOnly && user) {
        query = query
          .eq("created_by", user.id)
          .eq("complaint_type", DISPATCHER_REPORTING)
          .is("source_complaint_id", null);
      }
      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as DriverComplaint[];
    },
  });

  // Reportings that already have a manager-side copy
  // Driver -> company / dispatcher / office lookup for filtering
  const { data: driverMeta } = useQuery({
    queryKey: ["complaints-driver-meta"],
    queryFn: async () => {
      const [driversRes, companiesRes, profilesRes] = await Promise.all([
        supabase.from("drivers").select("id, company_id, dispatcher_id"),
        supabase.from("companies").select("id, name"),
        supabase.from("profiles").select("user_id, full_name, office"),
      ]);
      if (driversRes.error) throw driversRes.error;
      const companies = new Map(
        (companiesRes.data || []).map((c: any) => [c.id as string, c.name as string]),
      );
      // Complaint creators: user_id -> { name, office }
      const byUser = new Map<string, { name: string; office: string }>();
      for (const p of (profilesRes.data || []) as any[]) {
        byUser.set(p.user_id as string, {
          name: (p.full_name as string) || "",
          office: (p.office as string) || "",
        });
      }
      const byDriver = new Map<string, { company: string }>();
      for (const d of (driversRes.data || []) as any[]) {
        byDriver.set(d.id, {
          company: (d.company_id && companies.get(d.company_id)) || "",
        });
      }
      return {
        byDriver,
        byUser,
        companies: Array.from(new Set(Array.from(companies.values()))).sort(),
      };
    },
  });

  // Creator-based options (dispatcher = who created the complaint, office = their office)
  const creatorOptions = useMemo(() => {
    const dispatchers = new Set<string>();
    const offices = new Set<string>();
    for (const c of complaints) {
      const prof = c.created_by ? driverMeta?.byUser.get(c.created_by) : undefined;
      const name = prof?.name || c.created_by_name || "";
      if (name) dispatchers.add(name);
      if (prof?.office) offices.add(prof.office);
    }
    return {
      dispatchers: Array.from(dispatchers).sort(),
      offices: Array.from(offices).sort(),
    };
  }, [complaints, driverMeta]);

  const matchesMetaFilters = (c: DriverComplaint) => {
    if (!companyFilter && !dispatcherFilter && !officeFilter) return true;
    if (companyFilter) {
      const meta = c.driver_id ? driverMeta?.byDriver.get(c.driver_id) : undefined;
      if (meta?.company !== companyFilter) return false;
    }
    const prof = c.created_by ? driverMeta?.byUser.get(c.created_by) : undefined;
    if (dispatcherFilter && (prof?.name || c.created_by_name || "") !== dispatcherFilter) return false;
    if (officeFilter && (prof?.office || "") !== officeFilter) return false;
    return true;
  };

  const assignedSourceIds = useMemo(
    () =>
      new Set(
        complaints
          .map((c) => c.source_complaint_id)
          .filter((id): id is string => !!id),
      ),
    [complaints],
  );

  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return complaints.filter((c) => {
      const key = chicagoDateKey(new Date(c.created_at));
      if (key < rangeStart || key > rangeEnd) return false;
      if (!matchesMetaFilters(c)) return false;
      if (!q) return true;
      return (
        c.subject_text.toLowerCase().includes(q) ||
        c.content.toLowerCase().includes(q) ||
        (c.created_by_name || "").toLowerCase().includes(q)
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [complaints, searchQuery, rangeStart, rangeEnd, companyFilter, dispatcherFilter, officeFilter, driverMeta]);

  const isSearching = searchQuery.trim().length > 0;

  // Search mode: all complaints, any type / any date, grouped by Chicago day (newest first)
  const searchResults = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return [] as [string, DriverComplaint[]][];
    const matches = complaints
      // Managers/admins see the assigned copy instead of the original reporting
      .filter((c) => !(canManage && assignedSourceIds.has(c.id)))
      .filter(matchesMetaFilters)
      .filter(
        (c) =>
          c.subject_text.toLowerCase().includes(q) ||
          c.content.toLowerCase().includes(q) ||
          (c.created_by_name || "").toLowerCase().includes(q),
      );
    const map = new Map<string, DriverComplaint[]>();
    for (const c of matches) {
      const key = chicagoDateKey(new Date(c.created_at));
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(c);
    }
    for (const list of map.values()) {
      list.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    }
    return Array.from(map.entries()).sort((a, b) => (a[0] < b[0] ? 1 : -1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [complaints, searchQuery, canManage, assignedSourceIds, companyFilter, dispatcherFilter, officeFilter, driverMeta]);

  const byType = useMemo(() => {
    const map = new Map<string, DriverComplaint[]>();
    for (const c of filtered) {
      if (!map.has(c.complaint_type)) map.set(c.complaint_type, []);
      map.get(c.complaint_type)!.push(c);
    }
    return map;
  }, [filtered]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const activeGroup = groups[Math.min(groupIndex, groups.length - 1)];
  const activeTypes = activeGroup.types;
  return (
    <div className="max-w-[1800px] mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-3xl font-bold whitespace-nowrap">Drivers Complaints</h1>
        <div className="flex-1 flex justify-center max-w-xl min-w-[240px]">
          <div className="relative w-full">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
            <Input
              placeholder="Search by truck# , driver name or complaint..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-12 h-12 text-lg w-full"
            />
          </div>
        </div>
        <div className="flex items-center gap-2 rounded-lg border bg-card px-2 py-1.5">
          {groups.length > 1 && (
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => goGroup(-1)} title="Previous group">
              <ChevronLeft className="h-4 w-4" />
            </Button>
          )}
          <span className="text-sm font-medium min-w-[220px] text-center">{activeGroup.label}</span>
          {groups.length > 1 && (
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => goGroup(1)} title="Next group">
              <ChevronRight className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      <div className="relative flex items-center justify-center gap-3">
        <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => shiftWeek(-7)} title="Previous week">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-2 text-sm font-medium w-[320px] justify-center">
          <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7" title="Pick a date or range">
                <CalendarDays className="h-4 w-4 text-muted-foreground" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="center">
              <Calendar
                mode="range"
                numberOfMonths={2}
                defaultMonth={keyToDate(rangeStart)}
                selected={
                  customRange
                    ? {
                        from: keyToDate(customRange.from),
                        to: customRange.to ? keyToDate(customRange.to) : undefined,
                      }
                    : { from: keyToDate(rangeStart), to: keyToDate(rangeEnd) }
                }
                onSelect={(_range, day) => {
                  if (!day) return;
                  const toKey = (d: Date) =>
                    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
                  const key = toKey(day);
                  if (!customRange || customRange.to) {
                    // start a fresh selection: single day until a second date is picked
                    setCustomRange({ from: key, to: null });
                    return;
                  }
                  if (key === customRange.from) {
                    setPickerOpen(false);
                    return;
                  }
                  setCustomRange(
                    key < customRange.from
                      ? { from: key, to: customRange.from }
                      : { from: customRange.from, to: key },
                  );
                  setPickerOpen(false);
                }}
                initialFocus
                className="p-3 pointer-events-auto"
              />
              <div className="flex justify-end border-t p-2">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs"
                  onClick={() => {
                    setCustomRange(null);
                    setWeekStart(currentWeek);
                    setPickerOpen(false);
                  }}
                >
                  Reset to current week
                </Button>
              </div>
            </PopoverContent>
          </Popover>
          <span className="whitespace-nowrap">
            {rangeStart === rangeEnd
              ? prettyKey(rangeStart)
              : `${prettyKey(rangeStart)} – ${prettyKey(rangeEnd)}`}
          </span>
          {!customRange && weekStart === currentWeek ? (
            <span className="text-xs text-muted-foreground whitespace-nowrap">(current week)</span>
          ) : (
            <Button
              variant="link"
              size="sm"
              className="h-auto p-0 text-xs whitespace-nowrap"
              onClick={() => {
                setCustomRange(null);
                setWeekStart(currentWeek);
              }}
            >
              Back to current week
            </Button>
          )}
        </div>
        <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => shiftWeek(7)} title="Next week" disabled={!customRange && weekStart >= currentWeek}>
          <ChevronRight className="h-4 w-4" />
        </Button>

        <div className="flex items-center gap-1.5 lg:absolute lg:right-0 lg:top-1/2 lg:-translate-y-1/2">
          <Combobox
            className="h-7 w-[140px] text-[11px]"
            options={[
              { value: "", label: "All companies" },
              ...(driverMeta?.companies || []).map((c) => ({ value: c, label: c })),
            ]}
            value={companyFilter}
            onValueChange={setCompanyFilter}
            placeholder="All companies"
            searchPlaceholder="Search company..."
          />
          <Combobox
            className="h-7 w-[150px] text-[11px]"
            options={[
              { value: "", label: "All dispatchers" },
              ...creatorOptions.dispatchers.map((d) => ({ value: d, label: d })),
            ]}
            value={dispatcherFilter}
            onValueChange={setDispatcherFilter}
            placeholder="All dispatchers"
            searchPlaceholder="Search dispatcher..."
          />
          <Combobox
            className="h-7 w-[130px] text-[11px]"
            options={[
              { value: "", label: "All offices" },
              ...creatorOptions.offices.map((o) => ({ value: o, label: o })),
            ]}
            value={officeFilter}
            onValueChange={setOfficeFilter}
            placeholder="All offices"
            searchPlaceholder="Search office..."
          />
          <div className="w-[48px] shrink-0">
          {(companyFilter || dispatcherFilter || officeFilter) && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-[11px]"
              onClick={() => {
                setCompanyFilter("");
                setDispatcherFilter("");
                setOfficeFilter("");
              }}
            >
              Clear
            </Button>
          )}
          </div>
        </div>
      </div>

      {isSearching ? (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            {searchResults.reduce((n, [, items]) => n + items.length, 0)} result(s) across all
            categories and dates
          </p>
          {searchResults.length === 0 ? (
            <p className="text-sm text-muted-foreground">No complaints found</p>
          ) : (
            searchResults.map(([dayKey, items]) => (
              <div key={dayKey} className="rounded-lg border bg-card overflow-hidden">
                <div className="bg-muted/50 px-4 py-2 text-sm font-semibold">
                  {chicagoDayLabel(items[0].created_at)}
                </div>
                <div className="divide-y">
                  {items.map((c) => (
                    <div key={c.id} className="px-4 py-3 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-sm">{c.subject_text}</span>
                        <Badge className="text-[11px] py-0.5 px-2 font-semibold uppercase tracking-wide">
                          {COMPLAINT_TYPE_LABELS[c.complaint_type as ComplaintTypeKey] ||
                            c.complaint_type}
                        </Badge>
                        {c.is_resolved && (
                          <Badge variant="outline" className="text-[10px] py-0">
                            Resolved
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm whitespace-pre-wrap">{c.content}</p>
                      <span className="text-[11px] text-muted-foreground">
                        {c.created_by_name || "Unknown"} • {chicagoTime(c.created_at)}
                      </span>
                      <ComplaintComments complaintId={c.id} />
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      ) : (
      <div className="flex items-start gap-3">
        <div className="flex-1 overflow-hidden">
          <div
            key={groupIndex}
            className={`grid gap-6 ${
              activeTypes.length === 1 ? "grid-cols-1" : "md:grid-cols-2 xl:grid-cols-4"
            } ${
              direction === "right" ? "animate-slide-from-right" : "animate-slide-from-left"
            }`}
          >
            {activeTypes.map((type) => (
              <ComplaintCard
                key={type}
                type={type}
                complaints={byType.get(type) || []}
                assignedSourceIds={assignedSourceIds}
              />
            ))}
          </div>
        </div>
      </div>
      )}
    </div>
  );
};

export default DriversComplaints;
