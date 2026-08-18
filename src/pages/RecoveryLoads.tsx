import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency } from "@/lib/utils";
import { useDebounce } from "@/hooks/useDebounce";
import { getOrderFileSignedUrl } from "@/utils/orderFileSignedUrl";
import { useToast } from "@/hooks/use-toast";
import { formatInTimeZone } from "date-fns-tz";
import { AssignRecoveryLoadDialog } from "@/components/recovery/AssignRecoveryLoadDialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/hooks/useAuth";
import { RecoveryLoadsStats } from "@/components/recovery/RecoveryLoadsStats";

interface Stop {
  type: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip_code: string | null;
  sequence_number: number | null;
}

interface RetrievalOrder {
  id: string;
  broker_load_number: string | null;
  freight_amount: number | null;
  loaded_miles: number | null;
  canceled: boolean | null;
  booked_by: string | null;
  pickup_datetime: string | null;
  delivery_datetime: string | null;
  broker: { name: string | null } | null;
  booked_by_company: { name: string | null } | null;
  pickup_drops: Stop[] | null;
  order_files:
    | { id: string; file_category: string | null; file_name: string | null; file_path: string }[]
    | null;
}

// City, ST only
const formatStop = (stop?: Stop | null) => {
  if (!stop) return "—";
  const parts = [stop.city, stop.state].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : "—";
};

const formatFullStop = (stop?: Stop | null) => {
  if (!stop) return "—";
  const parts = [stop.address, stop.city, stop.state, stop.zip_code].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : "—";
};

const formatDateTime = (value?: string | null) => {
  if (!value) return "—";
  // Stored values are Chicago wall-time (often with a +00 offset) — read them naively.
  const m = String(value).match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/);
  if (!m) return "—";
  return `${m[2]}/${m[3]} ${m[4]}:${m[5]}`;
};

// Trim legal suffixes so "C.H. ROBINSON COMPANY, LLC" renders as "C.H. ROBINSON"
const shortenBrokerName = (name?: string | null) => {
  if (!name) return "—";
  let out = name.trim();
  out = out.replace(
    /[\s,.-]+(?:L\.?L\.?C\.?|L\.?L\.?P\.?|INC\.?|INCORPORATED|CORP\.?|CORPORATION|CO\.?|COMPANY|LTD\.?|LIMITED|PLC|LP|PC|USA|GROUP|HOLDINGS?|ENTERPRISES?|LOGISTICS|TRANSPORTATION|TRANSPORT|TRUCKING|FREIGHT|BROKERAGE|SERVICES?|SOLUTIONS)\b\.?/gi,
    ""
  );
  out = out.replace(/[\s,.-]+$/, "").trim();
  return out || name.trim();
};

const RecoveryLoads = () => {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [assignOrder, setAssignOrder] = useState<{
    id: string;
    loadNumber: string;
    pickupAddress: string;
  } | null>(null);
  const { hasRole } = useAuth();
  const canSeeStats = hasRole("manager") || hasRole("admin");
  const { toast } = useToast();

  const { data: orders = [], isLoading, refetch } = useQuery({
    queryKey: ["recovery-loads"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select(
          `id, broker_load_number, freight_amount, loaded_miles, canceled, booked_by, retrieval, recovery_assigned,
           pickup_datetime, delivery_datetime,
           broker:brokers ( name ),
           booked_by_company:companies!orders_booked_by_company_id_fkey ( name ),
           pickup_drops ( type, address, city, state, zip_code, sequence_number ),
           order_files ( id, file_category, file_name, file_path )`
        )
        .or("retrieval.eq.true,recovery_assigned.eq.true")
        .order("created_at", { ascending: false });

      if (error) throw error;
      return (data || []) as unknown as RetrievalOrder[];
    },
    staleTime: 30000,
  });

  const rows = useMemo(() => {
    return orders.map((order) => {
      const stops = [...(order.pickup_drops || [])].sort(
        (a, b) => (a.sequence_number ?? 0) - (b.sequence_number ?? 0)
      );
      const pickup = stops.find((s) => s.type === "pickup") || stops[0];
      const deliveries = stops.filter((s) => s.type === "delivery");
      const delivery = deliveries[deliveries.length - 1] || stops[stops.length - 1];
      const rpm =
        order.freight_amount && order.loaded_miles
          ? order.freight_amount / order.loaded_miles
          : null;

      return {
        id: order.id,
        loadNumber: order.broker_load_number || "—",
        pickupAddress: formatStop(pickup),
        deliveryAddress: formatStop(delivery),
        pickupFullAddress: formatFullStop(pickup),
        pickupDatetime: order.pickup_datetime,
        deliveryDatetime: order.delivery_datetime,
        bookedBy: order.booked_by || "—",
        rcFile: (order.order_files || []).find((f) => f.file_category === "RC") || null,
        freightAmount: order.freight_amount,
        rpm,
        loadedMiles: order.loaded_miles,
        bookedByCompany: order.booked_by_company?.name || "—",
        brokerName: shortenBrokerName(order.broker?.name),
        canceled: !!order.canceled,
        retrieval: !!(order as unknown as { retrieval?: boolean }).retrieval,
      };
    });
  }, [orders]);

  const filteredRows = useMemo(() => {
    const activeRows = rows.filter((r) => r.retrieval);
    const term = debouncedSearch.trim().toLowerCase();
    if (!term) return activeRows;
    return activeRows.filter((row) =>
      [
        row.loadNumber,
        row.pickupAddress,
        row.deliveryAddress,
        row.bookedBy,
        row.bookedByCompany,
        row.brokerName,
      ]
        .join(" ")
        .toLowerCase()
        .includes(term)
    );
  }, [rows, debouncedSearch]);

  const handleOpenRc = async (file: {
    id: string;
    file_category: string | null;
    file_name: string | null;
    file_path: string;
  } | null, orderId: string) => {
    if (!file) {
      toast({ title: "No RC", description: "This load has no RC file uploaded.", variant: "destructive" });
      return;
    }
    const { signedUrl } = await getOrderFileSignedUrl({
      id: file.id,
      order_id: orderId,
      file_category: file.file_category || "RC",
      file_name: file.file_name || "rc",
      file_path: file.file_path,
    });
    if (signedUrl) window.open(signedUrl, "_blank");
    else toast({ title: "Could not open RC", variant: "destructive" });
  };

  const loadsView = (
    <>
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="relative w-full max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search load#, address, broker, company..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      <Card className="overflow-x-auto">
        <Table className="table-fixed">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[110px]">Load#</TableHead>
              <TableHead className="w-[130px]">Pickup</TableHead>
              <TableHead className="w-[95px]">PU Date</TableHead>
              <TableHead className="w-[130px]">Delivery</TableHead>
              <TableHead className="w-[95px]">DEL Date</TableHead>
              <TableHead className="w-[95px]">Freight</TableHead>
              <TableHead className="w-[65px]">Miles</TableHead>
              <TableHead className="w-[150px]">Booked By</TableHead>
              <TableHead className="w-[160px]">Booked By Company</TableHead>
              <TableHead className="w-[130px]">Broker</TableHead>
              <TableHead className="w-[60px]">RC</TableHead>
              <TableHead className="w-[90px]">Assign</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={12} className="text-center text-muted-foreground py-8">
                  Loading...
                </TableCell>
              </TableRow>
            ) : filteredRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={12} className="text-center text-muted-foreground py-8">
                  No recovery loads found.
                </TableCell>
              </TableRow>
            ) : (
              filteredRows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium truncate" title={row.loadNumber}>{row.loadNumber}</TableCell>
                  <TableCell className="whitespace-normal break-words text-sm">
                    {row.pickupAddress}
                  </TableCell>
                  <TableCell className="text-sm whitespace-nowrap">{formatDateTime(row.pickupDatetime)}</TableCell>
                  <TableCell className="whitespace-normal break-words text-sm">
                    {row.deliveryAddress}
                  </TableCell>
                  <TableCell className="text-sm whitespace-nowrap">{formatDateTime(row.deliveryDatetime)}</TableCell>
                  <TableCell>
                    <div className="font-medium">
                      {row.freightAmount != null ? formatCurrency(row.freightAmount) : "—"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {row.rpm != null ? `${row.rpm.toFixed(2)} RPM` : "— RPM"}
                    </div>
                  </TableCell>
                  <TableCell>{row.loadedMiles ?? "—"}</TableCell>
                  <TableCell className="truncate" title={row.bookedBy}>
                    {row.bookedBy}
                  </TableCell>
                  <TableCell className="truncate">{row.bookedByCompany}</TableCell>
                  <TableCell className="truncate" title={row.brokerName}>
                    {row.brokerName}
                  </TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={!row.rcFile}
                      onClick={() => handleOpenRc(row.rcFile, row.id)}
                    >
                      RC
                    </Button>
                  </TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        setAssignOrder({
                          id: row.id,
                          loadNumber: row.loadNumber,
                          pickupAddress: row.pickupFullAddress,
                        })
                      }
                    >
                      Assign
                    </Button>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>

      <AssignRecoveryLoadDialog
        open={!!assignOrder}
        onOpenChange={(open) => !open && setAssignOrder(null)}
        orderId={assignOrder?.id ?? null}
        loadNumber={assignOrder?.loadNumber}
        pickupAddress={assignOrder?.pickupAddress}
        onAssigned={() => refetch()}
      />
    </>
  );

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold text-foreground">Recovery Loads</h1>
      {canSeeStats ? (
        <Tabs defaultValue="loads" className="space-y-4">
          <TabsList>
            <TabsTrigger value="loads">Loads</TabsTrigger>
            <TabsTrigger value="stats">Statistics</TabsTrigger>
          </TabsList>
          <TabsContent value="loads" className="space-y-4">
            {loadsView}
          </TabsContent>
          <TabsContent value="stats">
            <RecoveryLoadsStats
              isLoading={isLoading}
              rows={rows.map((r) => ({
                canceled: r.canceled,
                freightAmount: r.freightAmount,
                bookedByCompany: r.bookedByCompany,
              }))}
            />
          </TabsContent>
        </Tabs>
      ) : (
        <div className="space-y-4">{loadsView}</div>
      )}
    </div>
  );
};

export default RecoveryLoads;
