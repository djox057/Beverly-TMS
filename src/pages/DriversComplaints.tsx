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
  const [customRange, setCustomRange] = useState<{ from: string; to: string } | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  const rangeStart = customRange ? customRange.from : weekStart;
  const rangeEnd = customRange ? customRange.to : addDaysKey(weekStart, 6);

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
      if (!q) return true;
      return (
        c.subject_text.toLowerCase().includes(q) ||
        c.content.toLowerCase().includes(q) ||
        (c.created_by_name || "").toLowerCase().includes(q)
      );
    });
  }, [complaints, searchQuery, rangeStart, rangeEnd]);

  const isSearching = searchQuery.trim().length > 0;

  // Search mode: all complaints, any type / any date, grouped by Chicago day (newest first)
  const searchResults = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return [] as [string, DriverComplaint[]][];
    const matches = complaints
      // Managers/admins see the assigned copy instead of the original reporting
      .filter((c) => !(canManage && assignedSourceIds.has(c.id)))
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
  }, [complaints, searchQuery, canManage, assignedSourceIds]);

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
  const weekEnd = addDaysKey(weekStart, 6);

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

      <div className="flex items-center justify-center gap-3">
        <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setWeekStart((w) => addDaysKey(w, -7))} title="Previous week">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-2 text-sm font-medium w-[320px] justify-center">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7" title="Pick a date">
                <CalendarDays className="h-4 w-4 text-muted-foreground" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="center">
              <Calendar
                mode="single"
                selected={keyToDate(weekStart)}
                onSelect={(d) => {
                  if (!d) return;
                  const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
                  setWeekStart(weekStartKey(key));
                }}
                initialFocus
                className="p-3 pointer-events-auto"
              />
            </PopoverContent>
          </Popover>
          <span className="whitespace-nowrap">
            {prettyKey(weekStart)} – {prettyKey(weekEnd)}
          </span>
          {weekStart === currentWeek ? (
            <span className="text-xs text-muted-foreground whitespace-nowrap">(current week)</span>
          ) : (
            <Button variant="link" size="sm" className="h-auto p-0 text-xs whitespace-nowrap" onClick={() => setWeekStart(currentWeek)}>
              Back to current week
            </Button>
          )}
        </div>
        <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setWeekStart((w) => addDaysKey(w, 7))} title="Next week" disabled={weekStart >= currentWeek}>
          <ChevronRight className="h-4 w-4" />
        </Button>
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
