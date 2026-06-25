import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Truck, DollarSign, Gauge } from "lucide-react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type OrderRow = {
  id: string;
  load_number: string;
  delivery_datetime: string | null;
  pickup_datetime: string | null;
  freight_amount: number | null;
  mileage: number | null;
  driver_price: number | null;
  detention_driver: number | null;
  layover_driver: number | null;
  tonu_driver: number | null;
  extra_stop_driver: number | null;
  lumper_driver: number | null;
  late_fee_driver: number | null;
  no_tracking_fee_driver: number | null;
  wrong_address_fee_driver: number | null;
  other_charges_driver: number | null;
  other_additionals_driver: number | null;
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
  const [companyStats, setCompanyStats] = useState<{ wkRpm: number; mRpm: number }>({ wkRpm: 0, mRpm: 0 });
  const [stopMap, setStopMap] = useState<Record<string, { pickup: string; delivery: string }>>({});
  const [weekOffset, setWeekOffset] = useState(0);
  const [monthOffset, setMonthOffset] = useState(0);

  // Week range (Mon..Sun) for current weekOffset
  const weekRange = useMemo(() => {
    const now = new Date();
    const start = new Date(now);
    const day = (start.getDay() + 6) % 7;
    start.setDate(start.getDate() - day + weekOffset * 7);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    return { start, end };
  }, [weekOffset]);

  // Month range for current monthOffset
  const monthRange = useMemo(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() + monthOffset, 1);
    const end = new Date(now.getFullYear(), now.getMonth() + monthOffset + 1, 1);
    return { start, end };
  }, [monthOffset]);

  const fmtWeek = (r: { start: Date; end: Date }) => {
    const e = new Date(r.end);
    e.setDate(e.getDate() - 1);
    const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
    return `${r.start.toLocaleDateString(undefined, opts)} – ${e.toLocaleDateString(undefined, opts)}`;
  };
  const fmtMonth = (r: { start: Date; end: Date }) =>
    r.start.toLocaleDateString(undefined, { month: "long", year: "numeric" });

  useEffect(() => {
    if (!id) return;
    const load = async () => {
      setLoading(true);
      // dispatcher profile
      const { data: profile } = await supabase
        .from("profiles")
        .select("user_id, full_name, email, ext, office")
        .eq("user_id", id)
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

      // Fetch a range that covers both the selected week and month
      const since = new Date(Math.min(weekRange.start.getTime(), monthRange.start.getTime()));
      const until = new Date(Math.max(weekRange.end.getTime(), monthRange.end.getTime()));
      const { data: ords } = await supabase
        .from("orders")
        .select(
          "id, load_number, delivery_datetime, pickup_datetime, freight_amount, mileage, driver_price, detention_driver, layover_driver, tonu_driver, extra_stop_driver, lumper_driver, late_fee_driver, no_tracking_fee_driver, wrong_address_fee_driver, other_charges_driver, other_additionals_driver, driver1_id, status, canceled"
        )
        .in("driver1_id", driverIds)
        .gte("delivery_datetime", since.toISOString())
        .lt("delivery_datetime", until.toISOString())
        .eq("canceled", false)
        .order("delivery_datetime", { ascending: false });
      setOrders((ords as OrderRow[]) || []);

      // pickup / delivery city-state for those orders
      const orderIds = (ords || []).map((o: any) => o.id);
      if (orderIds.length > 0) {
        const { data: stops } = await supabase
          .from("pickup_drops")
          .select("order_id, type, sequence_number, city, state")
          .in("order_id", orderIds)
          .order("sequence_number", { ascending: true });
        const map: Record<string, { pickup: string; delivery: string }> = {};
        (stops || []).forEach((s: any) => {
          if (!map[s.order_id]) map[s.order_id] = { pickup: "", delivery: "" };
          const label = [s.city, s.state].filter(Boolean).join(", ");
          if (s.type === "pickup" && (!map[s.order_id].pickup || (s.sequence_number ?? 999) < 2)) {
            map[s.order_id].pickup = label;
          }
          if (s.type === "delivery") {
            map[s.order_id].delivery = label;
          }
        });
        setStopMap(map);
      } else {
        setStopMap({});
      }

      // company-wide averages for the same periods
      const { data: companyOrds } = await supabase
        .from("orders")
        .select("freight_amount, mileage, delivery_datetime, canceled")
        .gte("delivery_datetime", since.toISOString())
        .lt("delivery_datetime", until.toISOString())
        .eq("canceled", false);
      let wkFreight = 0, wkMiles = 0, mFreight = 0, mMiles = 0;
      (companyOrds || []).forEach((o: any) => {
        const d = o.delivery_datetime ? new Date(o.delivery_datetime) : null;
        if (!d) return;
        const f = Number(o.freight_amount) || 0;
        const m = Number(o.mileage) || 0;
        if (d >= monthRange.start && d < monthRange.end) {
          mFreight += f;
          mMiles += m;
        }
        if (d >= weekRange.start && d < weekRange.end) {
          wkFreight += f;
          wkMiles += m;
        }
      });
      setCompanyStats({
        wkRpm: wkMiles > 0 ? wkFreight / wkMiles : 0,
        mRpm: mMiles > 0 ? mFreight / mMiles : 0,
      });

      setLoading(false);
    };
    load();
  }, [id, weekRange, monthRange]);

  const [driverFilter, setDriverFilter] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState<string>("");

  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      const d = o.delivery_datetime ? new Date(o.delivery_datetime) : null;
      // Loads table reflects the selected month period
      if (!d) return false;
      if (d < monthRange.start || d >= monthRange.end) return false;
      if (driverFilter !== "all" && o.driver1_id !== driverFilter) return false;
      if (dateFilter) {
        const iso = d.toISOString().slice(0, 10);
        if (iso !== dateFilter) return false;
      }
      return true;
    });
  }, [orders, driverFilter, dateFilter, monthRange]);

  const stats = useMemo(() => {
    const driverPay = (o: OrderRow) => {
      const n = (v: any) => Number(v) || 0;
      return (
        n(o.driver_price) +
        n(o.detention_driver) +
        n(o.layover_driver) +
        n(o.tonu_driver) +
        n(o.extra_stop_driver) +
        n(o.lumper_driver) +
        n(o.other_additionals_driver) -
        n(o.late_fee_driver) -
        n(o.no_tracking_fee_driver) -
        n(o.wrong_address_fee_driver) -
        n(o.other_charges_driver)
      );
    };

    let wkFreight = 0,
      wkDriverPay = 0,
      wkMiles = 0,
      mFreight = 0,
      mDriverPay = 0,
      mMiles = 0,
      wkLoads = 0,
      mLoads = 0;
    for (const o of orders) {
      const d = o.delivery_datetime ? new Date(o.delivery_datetime) : null;
      if (!d) continue;
      const f = Number(o.freight_amount) || 0;
      const dp = driverPay(o);
      const m = Number(o.mileage) || 0;
      if (d >= monthRange.start && d < monthRange.end) {
        mFreight += f;
        mDriverPay += dp;
        mMiles += m;
        mLoads += 1;
      }
      if (d >= weekRange.start && d < weekRange.end) {
        wkFreight += f;
        wkDriverPay += dp;
        wkMiles += m;
        wkLoads += 1;
      }
    }
    return {
      wkFreight,
      wkDriverPay,
      wkComm: wkFreight - wkDriverPay,
      wkMiles,
      wkLoads,
      wkRpm: wkMiles > 0 ? wkFreight / wkMiles : 0,
      mFreight,
      mDriverPay,
      mComm: mFreight - mDriverPay,
      mMiles,
      mLoads,
      mRpm: mMiles > 0 ? mFreight / mMiles : 0,
    };
  }, [orders, weekRange, monthRange]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate("/dispatcher-tier")}>
          <ArrowLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <div>
          <h1 className="text-2xl font-bold">
            {loading
              ? "Loading..."
              : dispatcher?.full_name || dispatcher?.email || "Unknown dispatcher"}
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
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setWeekOffset((v) => v - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span>
                {weekOffset === 0 ? "Current Week (Mon–Sun)" : "Week"} · {fmtWeek(weekRange)}
              </span>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setWeekOffset((v) => v + 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-5 gap-3">
              <div>
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  <Gauge className="h-3 w-3" /> RPM
                </div>
                <div className="text-2xl font-bold">${stats.wkRpm.toFixed(2)}</div>
                <div className="text-[10px] text-muted-foreground">
                  company avg {companyStats.wkRpm.toFixed(2)}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  <DollarSign className="h-3 w-3" /> Freight
                </div>
                <div className="text-2xl font-bold">{fmtCurrency(stats.wkFreight)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  <Truck className="h-3 w-3" /> Miles
                </div>
                <div className="text-2xl font-bold">{stats.wkMiles.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  <DollarSign className="h-3 w-3" /> Comm
                </div>
                <div className="text-2xl font-bold">{fmtCurrency(stats.wkComm)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  <Truck className="h-3 w-3" /> Loads
                </div>
                <div className="text-2xl font-bold">{stats.wkLoads}</div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setMonthOffset((v) => v - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span>
                {monthOffset === 0 ? "Current Month" : "Month"} · {fmtMonth(monthRange)}
              </span>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => setMonthOffset((v) => v + 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-5 gap-3">
              <div>
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  <Gauge className="h-3 w-3" /> RPM
                </div>
                <div className="text-2xl font-bold">${stats.mRpm.toFixed(2)}</div>
                <div className="text-[10px] text-muted-foreground">
                  company avg {companyStats.mRpm.toFixed(2)}
                </div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  <DollarSign className="h-3 w-3" /> Freight
                </div>
                <div className="text-2xl font-bold">{fmtCurrency(stats.mFreight)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  <Truck className="h-3 w-3" /> Miles
                </div>
                <div className="text-2xl font-bold">{stats.mMiles.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  <DollarSign className="h-3 w-3" /> Comm
                </div>
                <div className="text-2xl font-bold">{fmtCurrency(stats.mComm)}</div>
              </div>
              <div>
                <div className="text-xs text-muted-foreground flex items-center gap-1">
                  <Truck className="h-3 w-3" /> Loads
                </div>
                <div className="text-2xl font-bold">{stats.mLoads}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="text-base">Loads ({fmtMonth(monthRange)})</CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={driverFilter} onValueChange={setDriverFilter}>
                <SelectTrigger className="w-[200px] h-9">
                  <SelectValue placeholder="All drivers" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All drivers</SelectItem>
                  {Object.entries(driverNameMap).map(([id, name]) => (
                    <SelectItem key={id} value={id}>
                      {name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                type="date"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="w-[170px] h-9"
              />
              {(driverFilter !== "all" || dateFilter) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setDriverFilter("all");
                    setDateFilter("");
                  }}
                >
                  Clear
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-muted-foreground text-sm py-6 text-center">Loading...</div>
          ) : filteredOrders.length === 0 ? (
            <div className="text-muted-foreground text-sm py-6 text-center">No loads</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Load #</TableHead>
                  <TableHead>Driver</TableHead>
                  <TableHead>Pickup</TableHead>
                  <TableHead>Pickup City, State</TableHead>
                  <TableHead>Delivery</TableHead>
                  <TableHead>Delivery City, State</TableHead>
                  <TableHead className="text-right">Freight</TableHead>
                  <TableHead className="text-right">Driver Pay</TableHead>
                  <TableHead className="text-right">Miles</TableHead>
                  <TableHead className="text-right">Comm.</TableHead>
                  <TableHead className="text-right">RPM</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredOrders.map((o) => {
                  const f = Number(o.freight_amount) || 0;
                  const m = Number(o.mileage) || 0;
                  const n = (v: any) => Number(v) || 0;
                  const dp =
                    n(o.driver_price) +
                    n(o.detention_driver) +
                    n(o.layover_driver) +
                    n(o.tonu_driver) +
                    n(o.extra_stop_driver) +
                    n(o.lumper_driver) +
                    n(o.other_additionals_driver) -
                    n(o.late_fee_driver) -
                    n(o.no_tracking_fee_driver) -
                    n(o.wrong_address_fee_driver) -
                    n(o.other_charges_driver);
                  const comm = f - dp;
                  const rpm = m > 0 ? f / m : 0;
                  return (
                    <TableRow key={o.id}>
                      <TableCell className="font-medium">{o.load_number}</TableCell>
                      <TableCell>{driverNameMap[o.driver1_id || ""] || "—"}</TableCell>
                      <TableCell>
                        {o.pickup_datetime
                          ? new Date(o.pickup_datetime).toLocaleDateString()
                          : "—"}
                      </TableCell>
                      <TableCell>{stopMap[o.id]?.pickup || "—"}</TableCell>
                      <TableCell>
                        {o.delivery_datetime
                          ? new Date(o.delivery_datetime).toLocaleDateString()
                          : "—"}
                      </TableCell>
                      <TableCell>{stopMap[o.id]?.delivery || "—"}</TableCell>
                      <TableCell className="text-right">{fmtCurrency(f)}</TableCell>
                      <TableCell className="text-right">{fmtCurrency(dp)}</TableCell>
                      <TableCell className="text-right">{m.toLocaleString()}</TableCell>
                      <TableCell className="text-right">{fmtCurrency(comm)}</TableCell>
                      <TableCell className="text-right">${rpm.toFixed(2)}</TableCell>
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