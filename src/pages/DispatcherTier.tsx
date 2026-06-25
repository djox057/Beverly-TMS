import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ArrowDown, ArrowUp, ArrowUpDown, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useFleetManagement } from "@/hooks/useFleetManagement";
import { supabase } from "@/integrations/supabase/client";

type SortKey = "name" | "office" | "currentTrucks" | "avgTrucks";
type SortDir = "asc" | "desc";

const DispatcherTier = () => {
  const { dispatchers, loading } = useFleetManagement();
  const [search, setSearch] = useState("");
  const [officeFilter, setOfficeFilter] = useState<string>("all");
  const [sortKey, setSortKey] = useState<SortKey>("avgTrucks");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [avgMap, setAvgMap] = useState<Record<string, number>>({});

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
      if (d.dispatcher.office) set.add(d.dispatcher.office);
    });
    return Array.from(set).sort();
  }, [dispatchers]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const data = dispatchers.map((d) => {
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
      else if (sortKey === "office") cmp = a.office.localeCompare(b.office);
      else if (sortKey === "currentTrucks") cmp = a.currentTrucks - b.currentTrucks;
      else if (sortKey === "avgTrucks") cmp = a.avgTrucks - b.avgTrucks;
      return sortDir === "asc" ? cmp : -cmp;
    });
    return filtered;
  }, [dispatchers, search, officeFilter, sortKey, sortDir, avgMap]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir(key === "name" || key === "office" ? "asc" : "desc");
    }
  };

  const SortIcon = ({ k }: { k: SortKey }) => {
    if (sortKey !== k) return <ArrowUpDown className="ml-1 h-3 w-3 opacity-50" />;
    return sortDir === "asc" ? (
      <ArrowUp className="ml-1 h-3 w-3" />
    ) : (
      <ArrowDown className="ml-1 h-3 w-3" />
    );
  };

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-3xl font-bold text-foreground">Dispatcher Tier</h1>
        <p className="text-muted-foreground text-sm">
          Overview of all dispatchers with current and 30-day average truck counts.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[240px] max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search dispatcher by name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={officeFilter} onValueChange={setOfficeFilter}>
          <SelectTrigger className="w-[200px]">
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
        <div className="text-sm text-muted-foreground ml-auto">
          {rows.length} dispatcher{rows.length === 1 ? "" : "s"}
        </div>
      </div>

      <Card>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 -ml-2"
                  onClick={() => toggleSort("name")}
                >
                  Dispatcher <SortIcon k="name" />
                </Button>
              </TableHead>
              <TableHead>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2 -ml-2"
                  onClick={() => toggleSort("office")}
                >
                  Office <SortIcon k="office" />
                </Button>
              </TableHead>
              <TableHead>Role</TableHead>
              <TableHead>Ext</TableHead>
              <TableHead className="text-right">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2"
                  onClick={() => toggleSort("currentTrucks")}
                >
                  Current Trucks <SortIcon k="currentTrucks" />
                </Button>
              </TableHead>
              <TableHead className="text-right">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 px-2"
                  onClick={() => toggleSort("avgTrucks")}
                >
                  Avg Trucks (30d) <SortIcon k="avgTrucks" />
                </Button>
              </TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                  Loading...
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                  No dispatchers found.
                </TableCell>
              </TableRow>
            ) : (
              rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">{r.name}</TableCell>
                  <TableCell>{r.office}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {r.roles.map((role) => (
                        <Badge key={role} variant="secondary" className="text-xs">
                          {role}
                        </Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">{r.ext || "—"}</TableCell>
                  <TableCell className="text-right tabular-nums">{r.currentTrucks}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {r.avgTrucks.toFixed(1)}
                  </TableCell>
                  <TableCell>
                    <Badge variant={r.isActive ? "default" : "outline"}>
                      {r.isActive ? "Active" : "Off Duty"}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
};

export default DispatcherTier;