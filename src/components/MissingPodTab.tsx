import { useMemo, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toZonedTime } from "date-fns-tz";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";
import { parseSimpleDateTime } from "@/utils/dateUtils";
import { formatInternalLoadNumber } from "@/utils/formatInternalLoadNumber";

const CHICAGO_TZ = "America/Chicago";

const toNaiveDate = (s: string | null | undefined): Date | null => {
  if (!s) return null;
  try {
    const p = parseSimpleDateTime(s);
    const d = new Date(p.year, p.month - 1, p.day, p.hours, p.minutes, 0);
    return isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
};

const formatElapsed = (ms: number): string => {
  const totalMin = Math.floor(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}h ${m}m`;
};

const formatDT = (d: Date): string => {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

interface Row {
  order_id: string;
  internal_load_number: string | null;
  load_number: string | null;
  truck_number: string | null;
  driver_name: string;
  booked_by: string | null;
  delivery_datetime: string | null;
  pod_uploaded_at: string | null;
  elapsedMs: number;
  frozen: boolean;
}

export const MissingPodTab = () => {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [tick, setTick] = useState(0);

  // Re-render every minute so live counters update
  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const { data, isLoading } = useQuery({
    queryKey: ["missing-pod-analytics"],
    refetchInterval: 5 * 60 * 1000,
    queryFn: async () => {
      // Chicago "now" as naive
      const nowChicago = toZonedTime(new Date(), CHICAGO_TZ);
      const cutoff = new Date(nowChicago.getTime() - 24 * 60 * 60 * 1000);
      // Look back 4 days
      const lookback = new Date(nowChicago.getTime() - 4 * 24 * 60 * 60 * 1000);

      const pad = (n: number) => String(n).padStart(2, "0");
      const toWall = (d: Date) =>
        `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;

      const { data: orders, error } = await supabase
        .from("orders")
        .select(
          `id, load_number, internal_load_number, delivery_datetime, booked_by,
           pod_force_complete, canceled, truck_id, driver1_id,
           trucks:truck_id ( truck_number ),
           drivers:driver1_id ( first_name, last_name ),
           order_files ( file_category, created_at )`,
        )
        .eq("canceled", false)
        .not("delivery_datetime", "is", null)
        .gte("delivery_datetime", toWall(lookback))
        .lte("delivery_datetime", toWall(cutoff))
        .limit(2000);

      if (error) throw error;

      const rows: Row[] = [];
      for (const o of orders || []) {
        if ((o as any).pod_force_complete) continue;
        if (!(o as any).driver1_id && !(o as any).truck_id) continue;
        const files: any[] = (o as any).order_files || [];
        const podFiles = files
          .filter((f) => f.file_category === "POD")
          .map((f) => new Date(f.created_at))
          .filter((d) => !isNaN(d.getTime()))
          .sort((a, b) => a.getTime() - b.getTime());
        const delivery = toNaiveDate((o as any).delivery_datetime);
        if (!delivery) continue;

        let elapsedMs: number;
        let frozen = false;
        let podUploadedIso: string | null = null;
        if (podFiles.length > 0) {
          // Convert POD created_at (UTC) to Chicago naive
          const podChicago = toZonedTime(podFiles[0], CHICAGO_TZ);
          elapsedMs = podChicago.getTime() - delivery.getTime();
          frozen = true;
          podUploadedIso = podFiles[0].toISOString();
        } else {
          elapsedMs = nowChicago.getTime() - delivery.getTime();
        }
        if (elapsedMs < 24 * 60 * 60 * 1000) continue;

        const drv: any = (o as any).drivers;
        const truck: any = (o as any).trucks;
        rows.push({
          order_id: (o as any).id,
          internal_load_number: (o as any).internal_load_number,
          load_number: (o as any).load_number,
          truck_number: truck?.truck_number || null,
          driver_name: drv ? `${drv.first_name || ""} ${drv.last_name || ""}`.trim() : "",
          booked_by: (o as any).booked_by,
          delivery_datetime: (o as any).delivery_datetime,
          pod_uploaded_at: podUploadedIso,
          elapsedMs,
          frozen,
        });
      }
      rows.sort((a, b) => b.elapsedMs - a.elapsedMs);
      return rows;
    },
  });

  const filtered = useMemo(() => {
    if (!data) return [] as Row[];
    const q = search.trim().toLowerCase();
    // Recompute live elapsed on each tick for non-frozen rows
    const nowChicago = toZonedTime(new Date(), CHICAGO_TZ);
    const updated = data.map((r) => {
      if (r.frozen) return r;
      const delivery = toNaiveDate(r.delivery_datetime);
      if (!delivery) return r;
      return { ...r, elapsedMs: nowChicago.getTime() - delivery.getTime() };
    });
    // reference tick so eslint doesn't complain
    void tick;
    if (!q) return updated;
    return updated.filter(
      (r) =>
        (r.load_number || "").toLowerCase().includes(q) ||
        (r.internal_load_number || "").toLowerCase().includes(q) ||
        (r.truck_number || "").toLowerCase().includes(q) ||
        r.driver_name.toLowerCase().includes(q) ||
        (r.booked_by || "").toLowerCase().includes(q),
    );
  }, [data, search, tick]);

  const openOrder = (id: string) => {
    localStorage.setItem("returnToAnalytics", "true");
    localStorage.setItem("analyticsActiveTab", "missing-pod");
    localStorage.removeItem("returnToReports");
    localStorage.removeItem("returnToTrips");
    localStorage.removeItem("returnToOrders");
    localStorage.removeItem("returnToYardLoads");
    navigate(`/edit-order/${id}`);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <CardTitle>Missing POD</CardTitle>
            <p className="text-sm text-muted-foreground mt-1">
              Loads where POD is 24h+ overdue since delivery. Timer freezes when POD is uploaded.
            </p>
          </div>
          <Input
            placeholder="Search load, truck, driver, dispatcher…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-72"
          />
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">No loads with missing POD 24h+ late.</div>
        ) : (
          <div className="border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[140px]">Internal #</TableHead>
                  <TableHead className="w-[140px]">Load #</TableHead>
                  <TableHead className="w-[100px]">Truck</TableHead>
                  <TableHead>Driver</TableHead>
                  <TableHead>Dispatcher</TableHead>
                  <TableHead className="w-[170px]">Delivery</TableHead>
                  <TableHead className="w-[140px]">POD Late By</TableHead>
                  <TableHead className="w-[110px]">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((r) => {
                  const delivery = toNaiveDate(r.delivery_datetime);
                  return (
                    <TableRow
                      key={r.order_id}
                      className="cursor-pointer hover:bg-muted/60"
                      onClick={() => openOrder(r.order_id)}
                    >
                      <TableCell className="font-mono">
                        {r.internal_load_number ? formatInternalLoadNumber(r.internal_load_number) : "—"}
                      </TableCell>
                      <TableCell>{r.load_number || "—"}</TableCell>
                      <TableCell>{r.truck_number || "—"}</TableCell>
                      <TableCell>{r.driver_name || "—"}</TableCell>
                      <TableCell>{r.booked_by || "—"}</TableCell>
                      <TableCell>{delivery ? formatDT(delivery) : "—"}</TableCell>
                      <TableCell className="font-semibold text-destructive">
                        {formatElapsed(r.elapsedMs)}
                      </TableCell>
                      <TableCell>
                        {r.frozen ? (
                          <Badge variant="secondary">Uploaded</Badge>
                        ) : (
                          <Badge variant="destructive">Missing</Badge>
                        )}
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
  );
};

export default MissingPodTab;