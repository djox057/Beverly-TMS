import { useState, useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { DateRange } from "react-day-picker";
import { ChevronDown, ChevronUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { DateRangePicker } from "@/components/ui/date-range-picker";
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

interface TerminatedDriver {
  id: string;
  name: string;
  termination_date: string;
  last_dispatcher_id: string;
  last_dispatcher_name: string | null;
  notes: { note: string; created_at: string }[];
}

interface DispatcherTurnover {
  dispatcherId: string;
  dispatcherName: string;
  office: string | null;
  turnoverCount: number;
  drivers: TerminatedDriver[];
}

const TurnoverList = () => {
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [selectedOffice, setSelectedOffice] = useState<string | null>(null);
  const [detailDispatcher, setDetailDispatcher] = useState<DispatcherTurnover | null>(null);
  const [lastTrucksByDriver, setLastTrucksByDriver] = useState<Record<string, string | null>>({});
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const driverIds: string[] = detailDispatcher
      ? detailDispatcher.drivers.map((d) => d.id)
      : [];
    if (driverIds.length === 0) return;
    const missing = driverIds.filter((id) => !(id in lastTrucksByDriver));
    if (missing.length === 0) return;
    (async () => {
      const { data } = await supabase
        .from("assignment_history")
        .select("driver1_id, driver2_id, changed_at, trucks:truck_id(truck_number)")
        .or(missing.map((id) => `driver1_id.eq.${id},driver2_id.eq.${id}`).join(","))
        .order("changed_at", { ascending: false });
      const map: Record<string, string | null> = {};
      for (const id of missing) map[id] = null;
      for (const row of (data as any[]) || []) {
        const truckNum = row.trucks?.truck_number || null;
        if (!truckNum) continue;
        for (const id of missing) {
          if ((row.driver1_id === id || row.driver2_id === id) && !map[id]) {
            map[id] = truckNum;
          }
        }
      }
      setLastTrucksByDriver((prev) => ({ ...prev, ...map }));
    })();
  }, [detailDispatcher, lastTrucksByDriver]);


  // Fetch offices
  const { data: offices } = useQuery({
    queryKey: ["turnover-offices"],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("office")
        .not("office", "is", null)
        .neq("office", "Recovery");
      const unique = [...new Set(data?.map((p) => p.office).filter(Boolean))] as string[];
      return unique.sort();
    },
  });

  // Fetch dispatchers (profiles with dispatch/afterhours roles)
  const { data: dispatchers } = useQuery({
    queryKey: ["turnover-dispatchers"],
    queryFn: async () => {
      const { data: roleData } = await supabase
        .from("user_roles")
        .select("user_id, role")
        .in("role", ["dispatch", "afterhours", "supervisor"]);
      if (!roleData) return [];

      const dispatcherIds = [...new Set(roleData.map((r) => r.user_id))];
      const { data: profiles } = await supabase
        .from("profiles")
        .select("user_id, full_name, office")
        .in("user_id", dispatcherIds);
      return profiles || [];
    },
  });

  // Fetch terminated drivers with notes
  const startDate = dateRange?.from ? format(dateRange.from, "yyyy-MM-dd") : null;
  const endDate = dateRange?.to ? format(dateRange.to, "yyyy-MM-dd") : null;

  const { data: terminatedDrivers, isLoading } = useQuery({
    queryKey: ["turnover-drivers", startDate, endDate],
    queryFn: async () => {
      if (!startDate || !endDate) return [];

      const { data } = await supabase
        .from("drivers")
        .select("id, name, termination_date, last_dispatcher_id, last_dispatcher_name, driver_termination_notes(note, created_at)")
        .eq("is_active", false)
        .not("last_dispatcher_id", "is", null)
        .not("termination_date", "is", null)
        .gte("termination_date", startDate)
        .lte("termination_date", endDate);

      return (data || []).map((d: any) => ({
        id: d.id,
        name: d.name,
        termination_date: d.termination_date,
        last_dispatcher_id: d.last_dispatcher_id,
        last_dispatcher_name: d.last_dispatcher_name || null,
        notes: d.driver_termination_notes || [],
      })) as TerminatedDriver[];
    },
    enabled: !!startDate && !!endDate,
  });

  // Group by dispatcher
  const turnoverData = useMemo(() => {
    if (!terminatedDrivers || !dispatchers) return [];

    const dispatcherMap = new Map(
      dispatchers.map((d) => [d.user_id, { name: d.full_name, office: d.office }])
    );

    const grouped = new Map<string, TerminatedDriver[]>();
    for (const driver of terminatedDrivers) {
      const existing = grouped.get(driver.last_dispatcher_id) || [];
      existing.push(driver);
      grouped.set(driver.last_dispatcher_id, existing);
    }

    const result: DispatcherTurnover[] = [];
    for (const [dispatcherId, drivers] of grouped) {
      const info = dispatcherMap.get(dispatcherId);
      const fallbackName = drivers[0]?.last_dispatcher_name;
      const isDeleted = !info;
      result.push({
        dispatcherId,
        dispatcherName: isDeleted
          ? `${fallbackName || "Unknown"} (former)`
          : info!.name,
        office: info?.office || (isDeleted ? "Former" : null),
        turnoverCount: drivers.length,
        drivers,
      });
    }

    // Filter by office
    const filtered = selectedOffice
      ? result.filter((d) => d.office === selectedOffice)
      : result;

    // Sort by turnover count descending
    return filtered.sort((a, b) => b.turnoverCount - a.turnoverCount);
  }, [terminatedDrivers, dispatchers, selectedOffice]);

  // Lazy-fetch last truck for all visible drivers when expanded
  useEffect(() => {
    if (!expanded) return;
    const allIds: string[] = [];
    for (const d of turnoverData) for (const dr of d.drivers) allIds.push(dr.id);
    const missing = allIds.filter((id) => !(id in lastTrucksByDriver));
    if (missing.length === 0) return;
    (async () => {
      const { data } = await supabase
        .from("assignment_history")
        .select("driver1_id, driver2_id, changed_at, trucks:truck_id(truck_number)")
        .or(missing.map((id) => `driver1_id.eq.${id},driver2_id.eq.${id}`).join(","))
        .order("changed_at", { ascending: false });
      const map: Record<string, string | null> = {};
      for (const id of missing) map[id] = null;
      for (const row of (data as any[]) || []) {
        const truckNum = row.trucks?.truck_number || null;
        if (!truckNum) continue;
        for (const id of missing) {
          if ((row.driver1_id === id || row.driver2_id === id) && !map[id]) {
            map[id] = truckNum;
          }
        }
      }
      setLastTrucksByDriver((prev) => ({ ...prev, ...map }));
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded, turnoverData]);

  const buildExplanation = (drivers: TerminatedDriver[]): string => {
    return drivers
      .map((d) => {
        const noteText = d.notes.map((n) => n.note).join("; ");
        return `${d.name}: ${noteText || "No note"}`;
      })
      .join(" | ");
  };

  return (
    <div className="p-6 space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Turnover List</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3">
            <DateRangePicker
              date={dateRange}
              onDateChange={setDateRange}
              placeholder="Select date range"
              className="w-auto min-w-[280px]"
            />
            <div className="flex gap-1">
              <Button
                variant={selectedOffice === null ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedOffice(null)}
              >
                All
              </Button>
              {offices?.map((office) => (
                <Button
                  key={office}
                  variant={selectedOffice === office ? "default" : "outline"}
                  size="sm"
                  onClick={() => setSelectedOffice(office)}
                >
                  {office}
                </Button>
              ))}
              <Button
                variant={selectedOffice === "Former" ? "default" : "outline"}
                size="sm"
                onClick={() => setSelectedOffice("Former")}
              >
                Former
              </Button>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setExpanded((v) => !v)}
              className="ml-auto"
            >
              {expanded ? (
                <>
                  <ChevronUp className="h-4 w-4 mr-1" />
                  Collapse
                </>
              ) : (
                <>
                  <ChevronDown className="h-4 w-4 mr-1" />
                  Expand
                </>
              )}
            </Button>
          </div>

          {/* Table */}
          {!startDate || !endDate ? (
            <p className="text-muted-foreground">Select a date range to view turnovers.</p>
          ) : isLoading ? (
            <p className="text-muted-foreground">Loading...</p>
          ) : turnoverData.length === 0 ? (
            <p className="text-muted-foreground">No turnovers found for this period.</p>
          ) : (
            <div className="border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[200px]">Dispatcher</TableHead>
                    <TableHead className="w-[120px]">Office</TableHead>
                    <TableHead className="w-[100px] text-center">Turnovers</TableHead>
                    <TableHead className="flex items-center justify-between">
                      <span>Explanation</span>
                      <span className="text-sm font-normal text-muted-foreground">
                        Total turnovers: {turnoverData.reduce((sum, item) => sum + item.turnoverCount, 0)}
                      </span>
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {turnoverData.map((item) => {
                    const explanation = buildExplanation(item.drivers);
                    const isTruncated = explanation.length > 120;

                    if (expanded) {
                      return (
                        <>
                          <TableRow key={item.dispatcherId} className="bg-muted/40">
                            <TableCell className="font-medium">{item.dispatcherName}</TableCell>
                            <TableCell className="text-muted-foreground">
                              {item.office || "—"}
                            </TableCell>
                            <TableCell className="text-center font-semibold">
                              {item.turnoverCount}
                            </TableCell>
                            <TableCell />
                          </TableRow>
                          {item.drivers.map((driver) => {
                            const truckNum = lastTrucksByDriver[driver.id] ?? null;
                            const noteText = driver.notes.length
                              ? driver.notes.map((n) => n.note).join("; ")
                              : "No termination notes";
                            const termDate = driver.termination_date
                              ? format(new Date(driver.termination_date + "T00:00:00"), "MM/dd/yyyy")
                              : "—";
                            return (
                              <TableRow key={`${item.dispatcherId}-${driver.id}`}>
                                <TableCell />
                                <TableCell />
                                <TableCell />
                                <TableCell className="text-sm pl-8">
                                  <span className="font-mono text-muted-foreground mr-2">
                                    {truckNum ? `#${truckNum}` : "—"}
                                  </span>
                                  <span className="font-medium">{driver.name}</span>
                                  <span className="text-muted-foreground mx-2">·</span>
                                  <span className="text-muted-foreground">{termDate}</span>
                                  <span className="text-muted-foreground mx-2">·</span>
                                  <span className="text-muted-foreground">{noteText}</span>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </>
                      );
                    }

                    return (
                      <TableRow key={item.dispatcherId} className="h-[72px]">
                        <TableCell className="font-medium align-top pt-4">
                          {item.dispatcherName}
                        </TableCell>
                        <TableCell className="align-top pt-4 text-muted-foreground">
                          {item.office || "—"}
                        </TableCell>
                        <TableCell className="text-center align-top pt-4 font-semibold">
                          {item.turnoverCount}
                        </TableCell>
                        <TableCell className="align-top pt-3">
                          <button
                            type="button"
                            onClick={() => setDetailDispatcher(item)}
                            className="line-clamp-2 text-sm text-muted-foreground leading-snug text-left hover:text-foreground cursor-pointer w-full"
                          >
                            {isTruncated ? `${explanation.slice(0, 120)}...` : explanation}
                          </button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Detail dialog */}
      <Dialog open={!!detailDispatcher} onOpenChange={() => setDetailDispatcher(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {detailDispatcher?.dispatcherName} — Turnovers ({detailDispatcher?.turnoverCount})
            </DialogTitle>
          </DialogHeader>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[90px]">Truck#</TableHead>
                <TableHead>Driver</TableHead>
                <TableHead className="w-[120px]">Termination Date</TableHead>
                <TableHead>Notes</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {detailDispatcher?.drivers.map((driver) => (
                <TableRow key={driver.id}>
                  <TableCell className="font-mono text-sm">
                    {lastTrucksByDriver[driver.id] ?? "—"}
                  </TableCell>
                  <TableCell className="font-medium">{driver.name}</TableCell>
                  <TableCell>
                    {driver.termination_date
                      ? format(new Date(driver.termination_date + "T00:00:00"), "MM/dd/yyyy")
                      : "—"}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {driver.notes.length > 0
                      ? driver.notes.map((n) => n.note).join("; ")
                      : "No termination notes"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default TurnoverList;
