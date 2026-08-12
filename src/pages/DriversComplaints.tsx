import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Loader2, Search } from "lucide-react";
import { ComplaintCard } from "@/components/complaints/ComplaintCard";
import {
  COMPLAINT_GROUPS,
  COMPLAINT_TYPE_LABELS,
  type ComplaintTypeKey,
  type DriverComplaint,
} from "@/components/complaints/complaintTypes";

const DriversComplaints = () => {
  const [searchQuery, setSearchQuery] = useState("");
  const [groupIndex, setGroupIndex] = useState(0);

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
    if (!q) return complaints;
    return complaints.filter(
      (c) =>
        c.subject_text.toLowerCase().includes(q) ||
        c.content.toLowerCase().includes(q) ||
        (c.created_by_name || "").toLowerCase().includes(q)
    );
  }, [complaints, searchQuery]);

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

  const activeTypes = COMPLAINT_GROUPS[groupIndex].types;

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
        <div className="flex items-center gap-1 rounded-md border p-1">
          {COMPLAINT_GROUPS.map((group, i) => (
            <Button
              key={group.label}
              variant={groupIndex === i ? "default" : "ghost"}
              size="sm"
              onClick={() => setGroupIndex(i)}
            >
              {group.types.map((t) => COMPLAINT_TYPE_LABELS[t as ComplaintTypeKey]).join(" · ")}
            </Button>
          ))}
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
        {activeTypes.map((type) => (
          <ComplaintCard key={type} type={type} complaints={byType.get(type) || []} />
        ))}
      </div>
    </div>
  );
};

export default DriversComplaints;
