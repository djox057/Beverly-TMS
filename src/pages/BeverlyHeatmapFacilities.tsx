import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowUpDown, ArrowUp, ArrowDown, Search, ChevronsUpDown, X, FileText } from "lucide-react";
import { getOrderFileSignedUrl } from "@/utils/orderFileSignedUrl";

import { DateRangePicker } from "@/components/ui/date-range-picker";
import { DateRange } from "react-day-picker";
import { format } from "date-fns";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";


interface FacilityRow {
  address: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  company_name: string | null;
  pickup_count: number;
  delivery_count: number;
  total_visits: number;
  broker_count: number;
  lat_cell: number;
  lng_cell: number;
}

interface BrokerRow {
  broker_id: string | null;
  broker_name: string | null;
  mc_number: string | null;
  load_count: number;
}

interface LaneRow {
  order_id: string;
  load_number: string | null;
  broker_name: string | null;
  origin_city: string | null;
  origin_state: string | null;
  destination_city: string | null;
  destination_state: string | null;
  pickup_date: string | null;
  delivery_date: string | null;
  freight_amount: number | null;
  loaded_miles: number | null;
  stop_datetime: string | null;
}

type SortKey =
  | "company_name"
  | "city"
  | "pickup_count"
  | "delivery_count"
  | "total_visits"
  | "broker_count";


export default function BeverlyHeatmapFacilities() {
  const [search, setSearch] = useState("");
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [selectedStates, setSelectedStates] = useState<string[]>([]);
  const [statesOpen, setStatesOpen] = useState(false);
  const [excludedBrokerIds, setExcludedBrokerIds] = useState<string[]>([]);
  const [brokersOpen, setBrokersOpen] = useState(false);
  const [sortConfig, setSortConfig] = useState<{ key: SortKey; dir: "asc" | "desc" }>({
    key: "total_visits",
    dir: "desc",
  });

  const startDateStr = dateRange?.from ? format(dateRange.from, "yyyy-MM-dd") : undefined;
  const endDateStr = dateRange?.to ? format(dateRange.to, "yyyy-MM-dd") : undefined;

  const { data: brokers = [] } = useQuery({
    queryKey: ["heatmap-brokers-list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("brokers")
        .select("id, name, mc_number")
        .order("name", { ascending: true })
        .limit(2000);
      if (error) throw error;
      return (data || []) as { id: string; name: string | null; mc_number: string | null }[];
    },
    staleTime: 30 * 60 * 1000,
  });

  const excludedBrokerKey = useMemo(() => [...excludedBrokerIds].sort().join(","), [excludedBrokerIds]);

  const { data: facilities = [], isLoading } = useQuery({
    queryKey: ["facility-visit-counts", startDateStr, endDateStr, excludedBrokerKey],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_facility_visit_counts", {
        p_start_date: startDateStr ?? null,
        p_end_date: endDateStr ?? null,
        p_exclude_broker_ids: excludedBrokerIds.length > 0 ? excludedBrokerIds : null,
      });
      if (error) throw error;
      return (data || []) as FacilityRow[];
    },
    staleTime: 5 * 60 * 1000,
  });

  const toggleBroker = (id: string) =>
    setExcludedBrokerIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const [brokerDetail, setBrokerDetail] = useState<FacilityRow | null>(null);
  const [laneDetail, setLaneDetail] = useState<{ row: FacilityRow; type: "pickup" | "delivery" } | null>(null);

  const { data: detailBrokers = [], isLoading: brokersLoading } = useQuery({
    queryKey: [
      "facility-brokers",
      brokerDetail?.lat_cell,
      brokerDetail?.lng_cell,
      startDateStr,
      endDateStr,
      excludedBrokerKey,
    ],
    enabled: !!brokerDetail,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_facility_brokers", {
        p_lat_cell: brokerDetail!.lat_cell,
        p_lng_cell: brokerDetail!.lng_cell,
        p_start_date: startDateStr ?? null,
        p_end_date: endDateStr ?? null,
        p_exclude_broker_ids: excludedBrokerIds.length > 0 ? excludedBrokerIds : null,
      });
      if (error) throw error;
      return (data || []) as BrokerRow[];
    },
  });

  const { data: detailLanes = [], isLoading: lanesLoading } = useQuery({
    queryKey: [
      "facility-lanes",
      laneDetail?.row.lat_cell,
      laneDetail?.row.lng_cell,
      laneDetail?.type,
      startDateStr,
      endDateStr,
      excludedBrokerKey,
    ],
    enabled: !!laneDetail,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_facility_lanes", {
        p_lat_cell: laneDetail!.row.lat_cell,
        p_lng_cell: laneDetail!.row.lng_cell,
        p_type: laneDetail!.type,
        p_start_date: startDateStr ?? null,
        p_end_date: endDateStr ?? null,
        p_exclude_broker_ids: excludedBrokerIds.length > 0 ? excludedBrokerIds : null,
      });
      if (error) throw error;
      return (data || []) as LaneRow[];
    },
  });

  const laneOrderIds = useMemo(() => detailLanes.map((l) => l.order_id), [detailLanes]);

  const { data: rcFiles = {} } = useQuery({
    queryKey: ["facility-lane-rc-files", laneOrderIds.join(",")],
    enabled: laneOrderIds.length > 0,
    queryFn: async () => {
      const map: Record<string, { id: string; file_path: string; file_name: string | null; file_category: string | null; order_id: string }> = {};
      for (let i = 0; i < laneOrderIds.length; i += 200) {
        const chunk = laneOrderIds.slice(i, i + 200);
        const { data, error } = await supabase
          .from("order_files")
          .select("id, order_id, file_category, file_name, file_path")
          .in("order_id", chunk)
          .eq("file_category", "RC");
        if (error) throw error;
        for (const f of data || []) {
          if (f.order_id && !map[f.order_id]) map[f.order_id] = f as any;
        }
      }
      return map;
    },
  });

  const openRc = async (orderId: string) => {
    const file = rcFiles[orderId];
    if (!file) return;
    const { signedUrl } = await getOrderFileSignedUrl(file);
    if (signedUrl) window.open(signedUrl, "_blank");
  };

  const fmtDate = (d: string | null) => (d ? format(new Date(d), "MM/dd/yyyy") : "—");
  const fmtMoney = (n: number | null) =>
    n == null ? "—" : `$${Number(n).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;






  const availableStates = useMemo(() => {
    const set = new Set<string>();
    for (const f of facilities) {
      const s = (f.state || "").trim().toUpperCase();
      if (s) set.add(s);
    }
    return [...set].sort();
  }, [facilities]);

  const toggleState = (s: string) =>
    setSelectedStates((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return facilities.filter((f) => {
      if (
        selectedStates.length > 0 &&
        !selectedStates.includes((f.state || "").trim().toUpperCase())
      )
        return false;
      if (!q) return true;
      return (
        (f.company_name || "").toLowerCase().includes(q) ||
        (f.city || "").toLowerCase().includes(q) ||
        (f.address || "").toLowerCase().includes(q)
      );
    });
  }, [facilities, search, selectedStates]);


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
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative max-w-sm flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search company, city, or address..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <DateRangePicker
          date={dateRange}
          onDateChange={setDateRange}
          placeholder="Filter by date range"
          className="w-[260px]"
        />
        <Popover open={statesOpen} onOpenChange={setStatesOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" className="w-[220px] justify-between font-normal">
              <span className="truncate">
                {selectedStates.length === 0
                  ? "Filter by state"
                  : selectedStates.length <= 3
                  ? selectedStates.join(", ")
                  : `${selectedStates.length} states selected`}
              </span>
              <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[220px] p-0" align="start">
            <Command>
              <CommandInput placeholder="Search state..." />
              <CommandList>
                <CommandEmpty>No state found.</CommandEmpty>
                <CommandGroup>
                  {availableStates.map((s) => (
                    <CommandItem key={s} value={s} onSelect={() => toggleState(s)}>
                      <Checkbox checked={selectedStates.includes(s)} className="mr-2" />
                      {s}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        {selectedStates.length > 0 && (
          <Button variant="ghost" size="sm" onClick={() => setSelectedStates([])}>
            <X className="h-4 w-4 mr-1" /> Clear states
          </Button>
        )}
        <Popover open={brokersOpen} onOpenChange={setBrokersOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" className="w-[260px] justify-between font-normal">
              <span className="truncate">
                {excludedBrokerIds.length === 0
                  ? "Exclude brokers"
                  : `${excludedBrokerIds.length} broker${excludedBrokerIds.length > 1 ? "s" : ""} excluded`}
              </span>
              <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[320px] p-0" align="start">
            <Command>
              <CommandInput placeholder="Search broker..." />
              <CommandList>
                <CommandEmpty>No broker found.</CommandEmpty>
                <CommandGroup>
                  {brokers.map((b) => (
                    <CommandItem
                      key={b.id}
                      value={`${b.name ?? ""} ${b.mc_number ?? ""}`}
                      onSelect={() => toggleBroker(b.id)}
                    >
                      <Checkbox checked={excludedBrokerIds.includes(b.id)} className="mr-2" />
                      <span className="truncate">
                        {b.name || "Unnamed"}
                        {b.mc_number ? ` (MC ${b.mc_number})` : ""}
                      </span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        {excludedBrokerIds.length > 0 && (
          <Button variant="ghost" size="sm" onClick={() => setExcludedBrokerIds([])}>
            <X className="h-4 w-4 mr-1" /> Clear brokers
          </Button>
        )}
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
          <Table className="table-fixed">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead
                  className="w-[180px] cursor-pointer select-none"
                  onClick={() => handleSort("company_name")}
                >
                  <span className="inline-flex items-center">
                    Company <SortIcon columnKey="company_name" />
                  </span>
                </TableHead>
                <TableHead className="w-[220px]">Address</TableHead>
                <TableHead
                  className="w-[130px] cursor-pointer select-none"
                  onClick={() => handleSort("city")}
                >
                  <span className="inline-flex items-center">
                    City <SortIcon columnKey="city" />
                  </span>
                </TableHead>
                <TableHead className="w-[60px]">State</TableHead>
                <TableHead className="w-[80px]">Zip</TableHead>
                <TableHead
                  className="text-center w-[90px] cursor-pointer select-none"
                  onClick={() => handleSort("pickup_count")}
                >
                  <span className="inline-flex items-center justify-center w-full">
                    Pickups <SortIcon columnKey="pickup_count" />
                  </span>
                </TableHead>
                <TableHead
                  className="text-center w-[100px] cursor-pointer select-none"
                  onClick={() => handleSort("delivery_count")}
                >
                  <span className="inline-flex items-center justify-center w-full">
                    Deliveries <SortIcon columnKey="delivery_count" />
                  </span>
                </TableHead>
                <TableHead
                  className="text-center w-[80px] cursor-pointer select-none"
                  onClick={() => handleSort("total_visits")}
                >
                  <span className="inline-flex items-center justify-center w-full">
                    Total <SortIcon columnKey="total_visits" />
                  </span>
                </TableHead>
                <TableHead
                  className="text-center w-[90px] cursor-pointer select-none"
                  onClick={() => handleSort("broker_count")}
                >
                  <span className="inline-flex items-center justify-center w-full">
                    Brokers <SortIcon columnKey="broker_count" />
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
                    <button
                      type="button"
                      disabled={!f.pickup_count}
                      onClick={() => setLaneDetail({ row: f, type: "pickup" })}
                      className="disabled:opacity-50 disabled:cursor-default"
                    >
                      <Badge variant="outline" className="font-mono hover:bg-accent cursor-pointer">
                        {f.pickup_count}
                      </Badge>
                    </button>
                  </TableCell>
                  <TableCell className="text-center">
                    <button
                      type="button"
                      disabled={!f.delivery_count}
                      onClick={() => setLaneDetail({ row: f, type: "delivery" })}
                      className="disabled:opacity-50 disabled:cursor-default"
                    >
                      <Badge variant="outline" className="font-mono hover:bg-accent cursor-pointer">
                        {f.delivery_count}
                      </Badge>
                    </button>
                  </TableCell>
                  <TableCell className="text-center">
                    <Badge variant="secondary" className="font-mono">
                      {f.total_visits}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">
                    <button
                      type="button"
                      disabled={!f.broker_count}
                      onClick={() => setBrokerDetail(f)}
                      className="disabled:opacity-50 disabled:cursor-default"
                    >
                      <Badge variant="outline" className="font-mono hover:bg-accent cursor-pointer">
                        {f.broker_count}
                      </Badge>
                    </button>
                  </TableCell>
                </TableRow>
              ))}

            </TableBody>
          </Table>
        </div>
      )}

      <Dialog open={!!brokerDetail} onOpenChange={(o) => !o && setBrokerDetail(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Brokers — {brokerDetail?.company_name || brokerDetail?.address || "Facility"}
            </DialogTitle>
          </DialogHeader>
          {brokersLoading ? (
            <div className="py-8 text-center text-muted-foreground">Loading brokers...</div>
          ) : detailBrokers.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">No brokers found.</div>
          ) : (
            <div className="max-h-[60vh] overflow-y-auto border rounded-lg">
              <Table className="table-fixed">
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-[280px]">Broker</TableHead>
                    <TableHead className="w-[120px]">MC</TableHead>
                    <TableHead className="w-[90px] text-center">Loads</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detailBrokers.map((b, i) => (
                    <TableRow key={b.broker_id ?? i} className="hover:bg-transparent">
                      <TableCell className="text-sm">{b.broker_name || "No broker"}</TableCell>
                      <TableCell className="text-sm font-mono">{b.mc_number || "—"}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant="outline" className="font-mono">
                          {b.load_count}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!laneDetail} onOpenChange={(o) => !o && setLaneDetail(null)}>
        <DialogContent className="max-w-[95vw] xl:max-w-[1400px]">
          <DialogHeader>
            <DialogTitle>
              {laneDetail?.type === "pickup" ? "Pickup" : "Delivery"} lanes —{" "}
              {laneDetail?.row.company_name || laneDetail?.row.address || "Facility"}
            </DialogTitle>
          </DialogHeader>
          {lanesLoading ? (
            <div className="py-8 text-center text-muted-foreground">Loading lanes...</div>
          ) : detailLanes.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">No loads found.</div>
          ) : (
            <div className="max-h-[70vh] overflow-auto border rounded-lg">
              <Table className="table-fixed">
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead className="w-[110px]">Load #</TableHead>
                    <TableHead className="w-[220px]">Broker</TableHead>
                    <TableHead className="w-[300px]">Lane</TableHead>
                    <TableHead className="w-[110px]">PU date</TableHead>
                    <TableHead className="w-[110px]">DEL date</TableHead>
                    <TableHead className="w-[110px] text-right">Rate</TableHead>
                    <TableHead className="w-[90px] text-right">Miles</TableHead>
                    <TableHead className="w-[80px] text-right">RPM</TableHead>
                    <TableHead className="w-[70px] text-center">RC</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {detailLanes.map((l) => (
                    <TableRow key={l.order_id} className="hover:bg-transparent">
                      <TableCell className="text-sm font-mono">{l.load_number || "—"}</TableCell>
                      <TableCell className="text-sm truncate">{l.broker_name || "—"}</TableCell>
                      <TableCell className="text-sm">
                        {(l.origin_city || "—")}, {l.origin_state || "—"} → {(l.destination_city || "—")},{" "}
                        {l.destination_state || "—"}
                      </TableCell>
                      <TableCell className="text-sm">{fmtDate(l.pickup_date)}</TableCell>
                      <TableCell className="text-sm">{fmtDate(l.delivery_date)}</TableCell>
                      <TableCell className="text-sm text-right font-mono">{fmtMoney(l.freight_amount)}</TableCell>
                      <TableCell className="text-sm text-right font-mono">
                        {l.loaded_miles != null ? Math.round(Number(l.loaded_miles)) : "—"}
                      </TableCell>
                      <TableCell className="text-sm text-right font-mono">
                        {l.freight_amount && l.loaded_miles
                          ? (Number(l.freight_amount) / Number(l.loaded_miles)).toFixed(2)
                          : "—"}
                      </TableCell>
                      <TableCell className="text-center">
                        {rcFiles[l.order_id] ? (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            title="Open rate confirmation"
                            onClick={() => openRc(l.order_id)}
                          >
                            <FileText className="h-4 w-4" />
                          </Button>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}

                </TableBody>
              </Table>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>

  );
}
