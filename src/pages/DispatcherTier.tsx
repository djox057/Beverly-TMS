import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, User, Truck, Building2, MessageSquare } from "lucide-react";
import { useFleetManagement } from "@/hooks/useFleetManagement";
import { supabase } from "@/integrations/supabase/client";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import DispatcherTierCommentsDialog from "@/components/DispatcherTierCommentsDialog";

type SortKey = "name" | "currentTrucks" | "avgTrucks";
type SortDir = "asc" | "desc";

const DispatcherTier = () => {
  const { dispatchers, loading } = useFleetManagement();
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [officeFilter, setOfficeFilter] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("avgTrucks");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [avgMap, setAvgMap] = useState<Record<string, number>>({});
  const [commentCounts, setCommentCounts] = useState<Record<string, number>>({});
  const [commentsOpen, setCommentsOpen] = useState<{ id: string; name: string } | null>(null);

  const reloadCommentCounts = async () => {
    const { data } = await supabase
      .from("dispatcher_tier_comments")
      .select("dispatcher_id");
    const acc: Record<string, number> = {};
    (data || []).forEach((r: any) => {
      acc[r.dispatcher_id] = (acc[r.dispatcher_id] || 0) + 1;
    });
    setCommentCounts(acc);
  };

  useEffect(() => {
    reloadCommentCounts();
  }, []);

  useEffect(() => {
    const fetchAvg = async () => {
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - 30);
      const fmt = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
          d.getDate()
        ).padStart(2, "0")}`;
      const { data } = await supabase
        .from("dispatcher_daily_driver_counts")
        .select("dispatcher_id, truck_count, driver_count")
        .gte("date", fmt(start))
        .lte("date", fmt(end));
      if (!data) return;
      const acc: Record<string, { total: number; days: number }> = {};
      data.forEach((r: any) => {
        const count = r.truck_count ?? r.driver_count ?? 0;
        if (!acc[r.dispatcher_id]) acc[r.dispatcher_id] = { total: 0, days: 0 };
        acc[r.dispatcher_id].total += count;
        acc[r.dispatcher_id].days += 1;
      });
      const out: Record<string, number> = {};
      Object.entries(acc).forEach(([id, s]) => {
        out[id] = s.days > 0 ? s.total / s.days : 0;
      });
      setAvgMap(out);
    };
    fetchAvg();
  }, []);

  const offices = useMemo(() => {
    const set = new Set<string>();
    dispatchers.forEach((d) => {
      if ((d.dispatcher.roles || []).includes("dispatch") && d.dispatcher.office) {
        set.add(d.dispatcher.office);
      }
    });
    return Array.from(set).sort();
  }, [dispatchers]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const data = dispatchers
      .filter((d) => (d.dispatcher.roles || []).includes("dispatch"))
      .map((d) => {
      const currentTrucks = d.drivers.filter((dr: any) => dr.truck).length;
      return {
        id: d.dispatcher.id,
        name: d.dispatcher.full_name || d.dispatcher.email,
        email: d.dispatcher.email,
        ext: d.dispatcher.ext,
        office: d.dispatcher.office || "—",
        roles: d.dispatcher.roles || [],
        isActive: d.isActive,
        currentTrucks,
        avgTrucks: avgMap[d.dispatcher.id] ?? 0,
      };
    });
    const filtered = data.filter((r) => {
      if (officeFilter !== "all" && r.office !== officeFilter) return false;
      if (q && !r.name?.toLowerCase().includes(q)) return false;
      return true;
    });
    filtered.sort((a, b) => {
      let cmp = 0;
      if (sortKey === "name") cmp = (a.name || "").localeCompare(b.name || "");
      else if (sortKey === "currentTrucks") cmp = a.currentTrucks - b.currentTrucks;
      else if (sortKey === "avgTrucks") cmp = a.avgTrucks - b.avgTrucks;
      return sortDir === "asc" ? cmp : -cmp;
    });
    return filtered;
  }, [dispatchers, search, officeFilter, sortKey, sortDir, avgMap]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dispatcher Tier</h1>
          <p className="text-muted-foreground">
            Overview of all dispatchers with current and 30-day average truck counts
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative max-w-md flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search dispatcher by name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={officeFilter} onValueChange={setOfficeFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Office" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All offices</SelectItem>
            {offices.map((o) => (
              <SelectItem key={o} value={o}>
                {o}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
          <SelectTrigger className="w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="name">Sort: Name</SelectItem>
            <SelectItem value="currentTrucks">Sort: Current Trucks</SelectItem>
            <SelectItem value="avgTrucks">Sort: Avg Trucks (30d)</SelectItem>
          </SelectContent>
        </Select>
        <Select value={sortDir} onValueChange={(v) => setSortDir(v as SortDir)}>
          <SelectTrigger className="w-[130px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="desc">Descending</SelectItem>
            <SelectItem value="asc">Ascending</SelectItem>
          </SelectContent>
        </Select>
        <div className="text-sm text-muted-foreground ml-auto">
          {rows.length} dispatcher{rows.length === 1 ? "" : "s"}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="text-muted-foreground">Loading dispatchers...</div>
        </div>
      ) : (
        <ScrollArea className="h-[calc(100vh-220px)]">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {rows.map((r) => (
              <Card
                key={r.id}
                className={`hover:bg-muted/50 transition-colors cursor-pointer ${!r.isActive ? "opacity-60" : ""}`}
                onClick={() => navigate(`/dispatcher-tier/${r.id}`)}
              >
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 bg-primary/10">
                      <User className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold truncate hover:underline">{r.name}</h3>
                        {r.ext && (
                          <span className="text-xs text-muted-foreground whitespace-nowrap">
                            Ext {r.ext}
                          </span>
                        )}
                        {!r.isActive && (
                          <Badge variant="outline" className="text-xs">Off Duty</Badge>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 px-2 ml-auto"
                          onClick={(e) => {
                            e.stopPropagation();
                            setCommentsOpen({ id: r.id, name: r.name || "" });
                          }}
                        >
                          <MessageSquare className="h-3.5 w-3.5 mr-1" />
                          {commentCounts[r.id] || 0}
                        </Button>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-nowrap overflow-hidden">
                    <Badge variant="outline" className="text-xs">
                      <Truck className="h-3 w-3 mr-1" />
                      {r.currentTrucks} now
                    </Badge>
                    <Badge variant="secondary" className="text-xs">
                      Avg {r.avgTrucks.toFixed(1)} / 30d
                    </Badge>
                    {r.office !== "—" && (
                      <Badge variant="secondary" className="text-xs whitespace-nowrap">
                        <Building2 className="h-3 w-3 mr-1" />
                        {r.office}
                      </Badge>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          {rows.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              No dispatchers found
            </div>
          )}
        </ScrollArea>
      )}

      {commentsOpen && (
        <DispatcherTierCommentsDialog
          open={!!commentsOpen}
          onOpenChange={(o) => {
            if (!o) {
              setCommentsOpen(null);
              reloadCommentCounts();
            }
          }}
          dispatcherId={commentsOpen.id}
          dispatcherName={commentsOpen.name}
        />
      )}
    </div>
  );
};

export default DispatcherTier;