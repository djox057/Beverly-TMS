import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ArrowUpDown, ArrowUp, ArrowDown, Search } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface FacilityRow {
  address: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  company_name: string | null;
  pickup_count: number;
  delivery_count: number;
  total_visits: number;
}

type SortKey = "company_name" | "city" | "pickup_count" | "delivery_count" | "total_visits";

export default function BeverlyHeatmapFacilities() {
  const [search, setSearch] = useState("");
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "total_visits",
    dir: "desc",
  });

  const { data: facilities = [], isLoading } = useQuery({
    queryKey: ["facility-visit-counts"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_facility_visit_counts");
      if (error) throw error;
      return (data || []) as FacilityRow[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return facilities;
    return facilities.filter(
      (f) =>
        (f.company_name || "").toLowerCase().includes(q) ||
        (f.city || "").toLowerCase().includes(q) ||
        (f.address || "").toLowerCase().includes(q)
    );
  }, [facilities, search]);

  const sorted = useMemo(() => {
    const rows = [...filtered];
    const { key, dir } = sortConfig;
    rows.sort((a, b) => {
      let cmp = 0;
      if (key === "company_name" || key === "city") {
        cmp = (a[key] || "").localeCompare(b[key] || "");
      } else {
        cmp = (a[key] || 0) - (b[key] || 0);
      }
      return dir === "asc" ? cmp : -cmp;
    });
    return rows;
  }, [filtered, sortConfig]);

  const handleSort = (key: SortKey) => {
    setSortConfig((prev) =>
      prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" }
    );
  };

  const SortIcon = ({ columnKey }: { columnKey: SortKey }) => {
    if (sortConfig.key !== columnKey) return <ArrowUpDown className="h-3.5 w-3.5 ml-1 opacity-40" />;
    return sortConfig.dir === "asc" ? (
      <ArrowUp className="h-3.5 w-3.5 ml-1" />
    ) : (
      <ArrowDown className="h-3.5 w-3.5 ml-1" />
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search company, city, or address..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Badge variant="outline" className="text-xs whitespace-nowrap">
          {filtered.length} facilities
        </Badge>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">Loading facility data...</div>
      ) : sorted.length === 0 ? (
        <div className="flex items-center justify-center py-12 text-muted-foreground">No facilities found.</div>
      ) : (
        <div className="overflow-x-auto border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead
                  className="min-w-[180px] cursor-pointer select-none"
                  onClick={() => handleSort("company_name")}
                >
                  <span className="inline-flex items-center">
                    Company <SortIcon columnKey="company_name" />
                  </span>
                </TableHead>
                <TableHead className="min-w-[200px]">Address</TableHead>
                <TableHead
                  className="min-w-[120px] cursor-pointer select-none"
                  onClick={() => handleSort("city")}
                >
                  <span className="inline-flex items-center">
                    City <SortIcon columnKey="city" />
                  </span>
                </TableHead>
                <TableHead className="min-w-[60px]">State</TableHead>
                <TableHead className="min-w-[80px]">Zip</TableHead>
                <TableHead
                  className="text-center min-w-[80px] cursor-pointer select-none"
                  onClick={() => handleSort("pickup_count")}
                >
                  <span className="inline-flex items-center justify-center w-full">
                    Pickups <SortIcon columnKey="pickup_count" />
                  </span>
                </TableHead>
                <TableHead
                  className="text-center min-w-[90px] cursor-pointer select-none"
                  onClick={() => handleSort("delivery_count")}
                >
                  <span className="inline-flex items-center justify-center w-full">
                    Deliveries <SortIcon columnKey="delivery_count" />
                  </span>
                </TableHead>
                <TableHead
                  className="text-center min-w-[70px] cursor-pointer select-none"
                  onClick={() => handleSort("total_visits")}
                >
                  <span className="inline-flex items-center justify-center w-full">
                    Total <SortIcon columnKey="total_visits" />
                  </span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((f, idx) => (
                <TableRow key={idx} className="hover:bg-transparent">
                  <TableCell className="font-medium text-sm">{f.company_name || "—"}</TableCell>
                  <TableCell className="text-sm">{f.address || "—"}</TableCell>
                  <TableCell className="text-sm">{f.city || "—"}</TableCell>
                  <TableCell className="text-sm">{f.state || "—"}</TableCell>
                  <TableCell className="text-sm font-mono">{f.zip_code || "—"}</TableCell>
                  <TableCell className="text-center">
                    <Badge variant="outline" className="font-mono">
                      {f.pickup_count}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant="outline" className="font-mono">
                      {f.delivery_count}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant="secondary" className="font-mono">
                      {f.total_visits}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
