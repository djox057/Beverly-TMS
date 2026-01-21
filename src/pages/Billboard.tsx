import { useMemo, useEffect, useState } from "react";
import { useOrders } from "@/hooks/useOrders";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

const Billboard = () => {
  const { data: orders, isLoading } = useOrders();
  const [dispatcherProfiles, setDispatcherProfiles] = useState<
    Record<string, { full_name: string; user_id: string }>
  >({});

  // Fetch profiles to resolve booked_by to display names
  useEffect(() => {
    const fetchProfiles = async () => {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("full_name, user_id");

      if (profiles) {
        const profileMap = profiles.reduce((acc, p) => {
          if (p.full_name) {
            acc[p.full_name] = { full_name: p.full_name, user_id: p.user_id };
          }
          if (p.user_id) {
            acc[p.user_id] = { full_name: p.full_name, user_id: p.user_id };
          }
          return acc;
        }, {} as Record<string, { full_name: string; user_id: string }>);
        setDispatcherProfiles(profileMap);
      }
    };
    fetchProfiles();
  }, []);

  // Get current week's Monday and Sunday (same logic as Analytics)
  const getWeekBounds = () => {
    const today = new Date();
    const dayOfWeek = today.getDay();
    const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1; // Monday as start
    const weekStart = new Date(today);
    weekStart.setDate(today.getDate() - diff);
    weekStart.setHours(0, 0, 0, 0);

    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);

    return { weekStart, weekEnd };
  };

  const { weekStart, weekEnd } = getWeekBounds();

  // Filter orders to this week only (using pickup date like Analytics weekly filter)
  const thisWeekOrders = useMemo(() => {
    if (!orders) return [];

    return orders.filter((order) => {
      // Exclude canceled orders (unless they have TONU)
      if (order.canceled && !(order.tonu > 0 || order.tonuDriver > 0)) {
        return false;
      }

      const dateToFilter = order.pickupDate;
      if (!dateToFilter || dateToFilter === "N/A" || dateToFilter === "Invalid Date" || dateToFilter === "") {
        return false;
      }

      try {
        let dateStr = dateToFilter;
        if (dateStr.includes(" ") && !dateStr.includes("T")) {
          dateStr = dateStr.replace(" ", "T");
        }
        const datePart = dateStr.split("T")[0];
        if (!datePart || !datePart.match(/^\d{4}-\d{2}-\d{2}$/)) {
          return false;
        }
        const [year, month, day] = datePart.split("-").map(Number);
        const orderDate = new Date(year, month - 1, day);

        if (isNaN(orderDate.getTime())) return false;

        const fromDateOnly = new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate());
        const toDateOnly = new Date(weekEnd.getFullYear(), weekEnd.getMonth(), weekEnd.getDate());

        return orderDate >= fromDateOnly && orderDate <= toDateOnly;
      } catch {
        return false;
      }
    });
  }, [orders, weekStart, weekEnd]);

  // Calculate dispatcher stats from this week's orders
  const dispatcherStats = useMemo(() => {
    const analytics: Record<string, { totalFreight: number; totalMiles: number; orderCount: number }> = {};

    thisWeekOrders.forEach((order) => {
      const dispatcher = order.bookedBy || "Unknown";
      if (!analytics[dispatcher]) {
        analytics[dispatcher] = { totalFreight: 0, totalMiles: 0, orderCount: 0 };
      }
      analytics[dispatcher].totalFreight += Number(order.totalFreightAmountNoLumper) || 0;
      analytics[dispatcher].totalMiles += Number(order.mileage) || 0;
      analytics[dispatcher].orderCount += 1;
    });

    return Object.entries(analytics)
      .map(([name, stats]) => {
        const ratePerMile = stats.totalMiles > 0 ? stats.totalFreight / stats.totalMiles : 0;
        // Resolve display name from profiles
        const profile = dispatcherProfiles[name];
        const displayName = profile?.full_name || name;

        return {
          name,
          displayName,
          totalFreight: stats.totalFreight,
          totalMiles: stats.totalMiles,
          ratePerMile,
          orderCount: stats.orderCount,
        };
      })
      .filter((d) => d.name !== "Unknown" && d.orderCount > 0)
      .sort((a, b) => b.totalFreight - a.totalFreight);
  }, [thisWeekOrders, dispatcherProfiles]);

  // Get top 5 dispatchers
  const top5Dispatchers = dispatcherStats.slice(0, 5);

  // Calculate overall RPM for this week
  const overallRPM = useMemo(() => {
    const totalFreight = thisWeekOrders.reduce((sum, o) => sum + (Number(o.totalFreightAmountNoLumper) || 0), 0);
    const totalMiles = thisWeekOrders.reduce((sum, o) => sum + (Number(o.mileage) || 0), 0);
    return totalMiles > 0 ? totalFreight / totalMiles : 0;
  }, [thisWeekOrders]);

  // Format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  // Format RPM
  const formatRPM = (rpm: number) => {
    return `$${rpm.toFixed(2)}`;
  };

  // Week date range string
  const weekRangeLabel = `${weekStart.toLocaleDateString("en-US", { month: "short", day: "numeric" })} - ${weekEnd.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-16 w-16 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col p-8">
      {/* Header - Week Label */}
      <div className="text-center mb-4">
        <p className="text-2xl text-muted-foreground font-medium">This Week: {weekRangeLabel}</p>
      </div>

      {/* Average RPM - Big number at top */}
      <div className="text-center py-8 border-b border-border">
        <p className="text-3xl text-muted-foreground uppercase tracking-widest mb-2">Average Rate Per Mile</p>
        <p className="text-[12rem] font-bold text-primary leading-none">{formatRPM(overallRPM)}</p>
      </div>

      {/* Top 5 Dispatchers */}
      <div className="flex-1 flex flex-col justify-center mt-8">
        <h2 className="text-3xl text-center text-muted-foreground uppercase tracking-widest mb-8">
          Top 5 Dispatchers by Gross
        </h2>

        <div className="space-y-4">
          {top5Dispatchers.map((dispatcher, index) => (
            <div
              key={dispatcher.name}
              className="flex items-center justify-between px-12 py-6 bg-card rounded-lg border border-border"
            >
              {/* Rank + Name */}
              <div className="flex items-center gap-6">
                <span className="text-6xl font-bold text-muted-foreground w-16 text-center">
                  {index + 1}
                </span>
                <span className="text-5xl font-semibold text-foreground">
                  {dispatcher.displayName}
                </span>
              </div>

              {/* Gross + RPM */}
              <div className="flex items-center gap-16">
                <div className="text-right">
                  <p className="text-lg text-muted-foreground uppercase tracking-wide">Gross</p>
                  <p className="text-5xl font-bold text-primary">{formatCurrency(dispatcher.totalFreight)}</p>
                </div>
                <div className="text-right">
                  <p className="text-lg text-muted-foreground uppercase tracking-wide">RPM</p>
                  <p className="text-5xl font-bold text-accent-foreground">{formatRPM(dispatcher.ratePerMile)}</p>
                </div>
              </div>
            </div>
          ))}

          {/* If less than 5 dispatchers, fill empty slots */}
          {Array.from({ length: Math.max(0, 5 - top5Dispatchers.length) }).map((_, i) => (
            <div
              key={`empty-${i}`}
              className="flex items-center justify-between px-12 py-6 bg-card/50 rounded-lg border border-border opacity-30"
            >
              <div className="flex items-center gap-6">
                <span className="text-6xl font-bold text-muted-foreground w-16 text-center">
                  {top5Dispatchers.length + i + 1}
                </span>
                <span className="text-5xl font-semibold text-muted-foreground">—</span>
              </div>
              <div className="flex items-center gap-16">
                <div className="text-right">
                  <p className="text-lg text-muted-foreground uppercase tracking-wide">Gross</p>
                  <p className="text-5xl font-bold text-muted-foreground">—</p>
                </div>
                <div className="text-right">
                  <p className="text-lg text-muted-foreground uppercase tracking-wide">RPM</p>
                  <p className="text-5xl font-bold text-muted-foreground">—</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Billboard;
