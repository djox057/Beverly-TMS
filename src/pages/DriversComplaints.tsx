import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Search, ChevronLeft, ChevronRight, CalendarDays } from "lucide-react";
import { ComplaintCard } from "@/components/complaints/ComplaintCard";
import {
  COMPLAINT_GROUPS,
  type DriverComplaint,
} from "@/components/complaints/complaintTypes";

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

const DriversComplaints = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [groupIndex, setGroupIndex] = useState(0);
  const [direction, setDirection] = useState<"left" | "right">("right");
  const currentWeek = weekStartKey(chicagoDateKey(new Date()));
  const [weekStart, setWeekStart] = useState(currentWeek);

  const goGroup = (delta: number) => {
    setDirection(delta > 0 ? "right" : "left");
    setGroupIndex((i) => (i + delta + COMPLAINT_GROUPS.length) % COMPLAINT_GROUPS.length);
  };

  const { data: complaints = [], isLoading } = useQuery({
    queryKey: ["driver-complaints"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("driver_complaints")
        .select("*")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as DriverComplaint[];
    },
  });

  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const weekEnd = addDaysKey(weekStart, 6);
    return complaints.filter((c) => {
      const key = chicagoDateKey(new Date(c.created_at));
      if (key < weekStart || key > weekEnd) return false;
      if (!q) return true;
      return (
        c.subject_text.toLowerCase().includes(q) ||
        c.content.toLowerCase().includes(q) ||
        (c.created_by_name || "").toLowerCase().includes(q)
      );
    });
  }, [complaints, searchQuery, weekStart]);

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

  const activeGroup = COMPLAINT_GROUPS[groupIndex];
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
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => goGroup(-1)} title="Previous group">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium min-w-[220px] text-center">{activeGroup.label}</span>
          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => goGroup(1)} title="Next group">
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="flex items-center justify-center gap-3">
        <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setWeekStart((w) => addDaysKey(w, -7))} title="Previous week">
          <ChevronLeft className="h-4 w-4" />
        </Button>
        <div className="flex items-center gap-2 text-sm font-medium">
          <CalendarDays className="h-4 w-4 text-muted-foreground" />
          <span>
            {prettyKey(weekStart)} – {prettyKey(weekEnd)}
          </span>
          {weekStart === currentWeek ? (
            <span className="text-xs text-muted-foreground">(current week)</span>
          ) : (
            <Button variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => setWeekStart(currentWeek)}>
              Back to current week
            </Button>
          )}
        </div>
        <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setWeekStart((w) => addDaysKey(w, 7))} title="Next week" disabled={weekStart >= currentWeek}>
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>

      <div className="flex items-start gap-3">
        {groupIndex > 0 && (
          <Button
            variant="outline"
            size="icon"
            className="h-12 w-9 shrink-0 mt-4"
            onClick={() => goGroup(-1)}
            title="Previous group"
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
        )}
        <div className="flex-1 overflow-hidden">
          <div
            key={groupIndex}
            className={`grid gap-6 md:grid-cols-2 xl:grid-cols-4 ${
              direction === "right" ? "animate-slide-from-right" : "animate-slide-from-left"
            }`}
          >
            {activeTypes.map((type) => (
              <ComplaintCard key={type} type={type} complaints={byType.get(type) || []} />
            ))}
          </div>
        </div>
        {groupIndex < COMPLAINT_GROUPS.length - 1 && (
          <Button
            variant="outline"
            size="icon"
            className="h-12 w-9 shrink-0 mt-4"
            onClick={() => goGroup(1)}
            title="Next group"
          >
            <ChevronRight className="h-5 w-5" />
          </Button>
        )}
      </div>
    </div>
  );
};

export default DriversComplaints;
