import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
  broker: { name: string | null } | null;
  booked_by_company: { name: string | null } | null;
  pickup_drops: Stop[] | null;
}

const formatStop = (stop?: Stop | null) => {
  if (!stop) return "—";
  const parts = [stop.address, stop.city, stop.state, stop.zip_code].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : "—";
};

const RecoveryLoads = () => {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);

  const { data: orders = [], isLoading } = useQuery({
    queryKey: ["recovery-loads"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("orders")
        .select(
          `id, broker_load_number, freight_amount, loaded_miles,
           broker:brokers ( name ),
           booked_by_company:companies!orders_booked_by_company_id_fkey ( name ),
           pickup_drops ( type, address, city, state, zip_code, sequence_number )`
        )
        .eq("retrieval", true)
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
        freightAmount: order.freight_amount,
        rpm,
        loadedMiles: order.loaded_miles,
        bookedByCompany: order.booked_by_company?.name || "—",
        brokerName: order.broker?.name || "—",
      };
    });
  }, [orders]);

  const filteredRows = useMemo(() => {
    const term = debouncedSearch.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((row) =>
      [
        row.loadNumber,
        row.pickupAddress,
        row.deliveryAddress,
        row.bookedByCompany,
        row.brokerName,
      ]
        .join(" ")
        .toLowerCase()
        .includes(term)
    );
  }, [rows, debouncedSearch]);

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <h1 className="text-2xl font-semibold text-foreground">Recovery Loads</h1>
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
              <TableHead className="w-[140px]">Load#</TableHead>
              <TableHead className="w-[300px]">Pickup Address</TableHead>
              <TableHead className="w-[300px]">Delivery Address</TableHead>
              <TableHead className="w-[130px]">Freight Amount</TableHead>
              <TableHead className="w-[110px]">Loaded Miles</TableHead>
              <TableHead className="w-[200px]">Booked By Company</TableHead>
              <TableHead className="w-[200px]">Broker</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                  Loading...
                </TableCell>
              </TableRow>
            ) : filteredRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                  No recovery loads found.
                </TableCell>
              </TableRow>
            ) : (
              filteredRows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="font-medium truncate">{row.loadNumber}</TableCell>
                  <TableCell className="whitespace-normal break-words text-sm">
                    {row.pickupAddress}
                  </TableCell>
                  <TableCell className="whitespace-normal break-words text-sm">
                    {row.deliveryAddress}
                  </TableCell>
                  <TableCell>
                    <div className="font-medium">
                      {row.freightAmount != null ? formatCurrency(row.freightAmount) : "—"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {row.rpm != null ? `${row.rpm.toFixed(2)} RPM` : "— RPM"}
                    </div>
                  </TableCell>
                  <TableCell>{row.loadedMiles ?? "—"}</TableCell>
                  <TableCell className="truncate">{row.bookedByCompany}</TableCell>
                  <TableCell className="truncate">{row.brokerName}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </Card>
    </div>
  );
};

export default RecoveryLoads;
