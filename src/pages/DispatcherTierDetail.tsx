import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Truck, DollarSign, Gauge } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type OrderRow = {
  id: string;
  load_number: string;
  delivery_datetime: string | null;
  pickup_datetime: string | null;
  freight_amount: number | null;
  mileage: number | null;
  driver1_id: string | null;
  status: string | null;
  canceled: boolean | null;
};

const fmtCurrency = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

const DispatcherTierDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [dispatcher, setDispatcher] = useState<any>(null);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [driverNameMap, setDriverNameMap] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    const load = async () => {
      setLoading(true);
      // dispatcher profile
      const { data: profile } = await supabase
        .from("profiles")
        .select("id, full_name, email, ext, office, roles")
        .eq("id", id)
        .maybeSingle();
      setDispatcher(profile);

      // drivers assigned to this dispatcher
      const { data: drivers } = await supabase
        .from("drivers")
        .select("id, name")
        .eq("dispatcher_id", id);
      const driverIds = (drivers || []).map((d: any) => d.id);
      const nameMap: Record<string, string> = {};
      (drivers || []).forEach((d: any) => (nameMap[d.id] = d.name));
      setDriverNameMap(nameMap);

      if (driverIds.length === 0) {
        setOrders([]);
        setLoading(false);
        return;
      }

      const since = new Date();
      since.setDate(since.getDate() - 30);
      const { data: ords } = await supabase
        .from("orders")
        .select(
          "id, load_number, delivery_datetime, pickup_datetime, freight_amount, mileage, driver1_id, status, canceled"
        )
        .in("driver1_id", driverIds)
        .gte("delivery_datetime", since.toISOString())
        .eq("canceled", false)
        .order("delivery_datetime", { ascending: false });
      setOrders((ords as OrderRow[]) || []);
      setLoading(false);
    };
    load();
  }, [id]);

  const stats = useMemo(() => {
    const now = new Date();
    // Current week: Monday start
    const weekStart = new Date(now);
    const day = (weekStart.getDay() + 6) % 7; // Mon=0
    weekStart.setDate(weekStart.getDate() - day);
    weekStart.setHours(0, 0, 0, 0);

    let wkFreight = 0,
      wkMiles = 0,
      mFreight = 0,
      mMiles = 0,
      wkLoads = 0,
      mLoads = 0;
    for (const o of orders) {
      const d = o.delivery_datetime ? new Date(o.delivery_datetime) : null;
      if (!d) continue;
      const f = Number(o.freight_amount) || 0;
      const m = Number(o.mileage) || 0;
      mFreight += f;
      mMiles += m;
      mLoads += 1;
      if (d >= weekStart) {
        wkFreight += f;
        wkMiles += m;
        wkLoads += 1;
      }
    }
    return {
      wkFreight,
      wkMiles,
      wkLoads,
      wkRpm: wkMiles > 0 ? wkFreight / wkMiles : 0,
      mFreight,
      mMiles,
      mLoads,
      mRpm: mMiles > 0 ? mFreight / mMiles : 0,
    };
  }, [orders]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate("/dispatcher-tier")}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <div>
          <h1 className="text-2xl font-bold">
            {dispatcher?.full_name || dispatcher?.email || "Dispatcher"}
          </h1>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            {dispatcher?.office && <Badge variant="secondary">{dispatcher.office}</Badge>}
            {dispatcher?.ext && <span>Ext {dispatcher.ext}</span>}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Current Week (Mon–Sun)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  <Gauge className="h-3 w-3" /> RPM
                </div>
                <div className="text-2xl font-bold">${stats.wkRpm.toFixed(2)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  <DollarSign className="h-3 w-3" /> Freight
                </div>
                <div className="text-2xl font-bold">{fmtCurrency(stats.wkFreight)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  <Truck className="h-3 w-3" /> Loads
                </div>
                <div className="text-2xl font-bold">{stats.wkLoads}</div>
              </div>
            </div>
            <div className="text-xs text-muted-foreground mt-2">
              {stats.wkMiles.toLocaleString()} miles
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Last 30 Days
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  <Gauge className="h-3 w-3" /> RPM
                </div>
                <div className="text-2xl font-bold">${stats.mRpm.toFixed(2)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  <DollarSign className="h-3 w-3" /> Freight
                </div>
                <div className="text-2xl font-bold">{fmtCurrency(stats.mFreight)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  <Truck className="h-3 w-3" /> Loads
                </div>
                <div className="text-2xl font-bold">{stats.mLoads}</div>
              </div>
            </div>
            <div className="text-xs text-muted-foreground mt-2">
              {stats.mMiles.toLocaleString()} miles
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Loads (Last 30 Days)</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-muted-foreground text-sm py-6 text-center">Loading...</div>
          ) : orders.length === 0 ? (
            <div className="text-muted-foreground text-sm py-6 text-center">No loads</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Load #</TableHead>
                  <TableHead>Driver</TableHead>
                  <TableHead>Delivery</TableHead>
                  <TableHead className="text-right">Freight</TableHead>
                  <TableHead className="text-right">Miles</TableHead>
                  <TableHead className="text-right">RPM</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((o) => {
                  const f = Number(o.freight_amount) || 0;
                  const m = Number(o.mileage) || 0;
                  const rpm = m > 0 ? f / m : 0;
                  return (
                    <TableRow key={o.id}>
                      <TableCell className="font-medium">{o.load_number}</TableCell>
                      <TableCell>{driverNameMap[o.driver1_id || ""] || "—"}</TableCell>
                      <TableCell>
                        {o.delivery_datetime
                          ? new Date(o.delivery_datetime).toLocaleDateString()
                          : "—"}
                      </TableCell>
                      <TableCell className="text-right">{fmtCurrency(f)}</TableCell>
                      <TableCell className="text-right">{m.toLocaleString()}</TableCell>
                      <TableCell className="text-right">${rpm.toFixed(2)}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {o.status || "—"}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default DispatcherTierDetail;