import { useMemo, useEffect, useState } from "react";
import { useOrders } from "@/hooks/useOrders";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

const Billboard = () => {
  const { data: orders, isLoading } = useOrders();
  const [dispatcherProfiles, setDispatcherProfiles] = useState<
    Record<string, { full_name: string; user_id: string; office: string | null }>
  >({});
  const [dispatcherTruckCounts, setDispatcherTruckCounts] = useState<Record<string, number>>();
  const [activeView, setActiveView] = useState<
    "gross5" | "gross10" | "rpm5" | "rpm10" | "monthlyRpm5" | "monthlyRpm10"
  >("rpm5");
  const [isTransitioning, setIsTransitioning] = useState(false);

  // Fetch profiles to resolve booked_by to display names and office
  useEffect(() => {
    const fetchProfiles = async () => {
      const { data: profiles } = await supabase.from("profiles").select("full_name, user_id, office");

      if (profiles) {
        const profileMap = profiles.reduce(
          (acc, p) => {
            if (p.full_name) {
              acc[p.full_name] = { full_name: p.full_name, user_id: p.user_id, office: p.office };
            }
            if (p.user_id) {
              acc[p.user_id] = { full_name: p.full_name, user_id: p.user_id, office: p.office };
            }
            return acc;
          },
          {} as Record<string, { full_name: string; user_id: string; office: string | null }>,
        );
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

  // Fetch average truck counts for dispatchers this week
  useEffect(() => {
    const fetchTruckCounts = async () => {
      const startStr = weekStart.toISOString().split("T")[0];
      const endStr = weekEnd.toISOString().split("T")[0];

      const { data } = await supabase
        .from("dispatcher_daily_driver_counts")
        .select("dispatcher_id, driver_count")
        .gte("date", startStr)
        .lte("date", endStr);

      if (data) {
        // Calculate average truck count per dispatcher for this week
        const counts: Record<string, { total: number; days: number }> = {};
        data.forEach((row) => {
          if (!counts[row.dispatcher_id]) {
            counts[row.dispatcher_id] = { total: 0, days: 0 };
          }
          counts[row.dispatcher_id].total += row.driver_count;
          counts[row.dispatcher_id].days += 1;
        });

        const avgCounts: Record<string, number> = {};
        Object.entries(counts).forEach(([userId, stats]) => {
          avgCounts[userId] = stats.days > 0 ? stats.total / stats.days : 0;
        });
        setDispatcherTruckCounts(avgCounts);
      }
    };
    fetchTruckCounts();
  }, [weekStart, weekEnd]);

  // Get current month bounds
  const getMonthBounds = () => {
    const today = new Date();
    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    monthStart.setHours(0, 0, 0, 0);
    const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    monthEnd.setHours(23, 59, 59, 999);
    return { monthStart, monthEnd };
  };

  const { monthStart, monthEnd } = getMonthBounds();

  // Filter orders for current month
  const thisMonthOrders = useMemo(() => {
    if (!orders) return [];

    return orders.filter((order) => {
      if (order.canceled && !(order.tonu > 0 || order.tonuDriver > 0)) {
        return false;
      }

      // Use delivery date for monthly filtering
      const dateToFilter = order.deliveryDate;
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

        const fromDateOnly = new Date(monthStart.getFullYear(), monthStart.getMonth(), monthStart.getDate());
        const toDateOnly = new Date(monthEnd.getFullYear(), monthEnd.getMonth(), monthEnd.getDate());

        return orderDate >= fromDateOnly && orderDate <= toDateOnly;
      } catch {
        return false;
      }
    });
  }, [orders, monthStart, monthEnd]);

  // Calculate monthly dispatcher stats
  const monthlyDispatcherStats = useMemo(() => {
    const analytics: Record<string, { totalFreight: number; totalMiles: number; orderCount: number }> = {};

    thisMonthOrders.forEach((order) => {
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
        const profile = dispatcherProfiles[name];
        const displayName = profile?.full_name || name;
        const userId = profile?.user_id;
        const office = profile?.office || null;
        const avgTrucks = userId ? dispatcherTruckCounts?.[userId] || 0 : 0;

        return {
          name,
          displayName,
          userId,
          office,
          totalFreight: stats.totalFreight,
          totalMiles: stats.totalMiles,
          ratePerMile,
          orderCount: stats.orderCount,
          avgTrucks,
        };
      })
      .filter((d) => d.name !== "Unknown" && d.orderCount > 0);
  }, [thisMonthOrders, dispatcherProfiles, dispatcherTruckCounts]);

  // Sorted monthly RPM list (filtered by 4.8+ trucks)
  const sortedMonthlyByRPM = useMemo(() => {
    const qualified = [...monthlyDispatcherStats].filter((d) => d.avgTrucks >= 4.8);
    const list = qualified.length > 0 ? qualified : [...monthlyDispatcherStats];
    return list.sort((a, b) => b.ratePerMile - a.ratePerMile);
  }, [monthlyDispatcherStats]);

  const top5MonthlyRPM = sortedMonthlyByRPM.slice(0, 5);
  const top10MonthlyRPM = sortedMonthlyByRPM.slice(5, 10);

  // View order now has 6 pages
  const viewOrder: Array<"rpm5" | "rpm10" | "gross5" | "gross10" | "monthlyRpm5" | "monthlyRpm10"> = [
    "rpm5",
    "rpm10",
    "gross5",
    "gross10",
    "monthlyRpm5",
    "monthlyRpm10",
  ];

  // Rotate views every 20 seconds with smooth transition (6 views)
  useEffect(() => {
    const interval = setInterval(() => {
      setIsTransitioning(true);
      setTimeout(() => {
        setActiveView((prev) => {
          const currentIndex = viewOrder.indexOf(prev);
          const nextIndex = (currentIndex + 1) % viewOrder.length;
          return viewOrder[nextIndex];
        });
        setTimeout(() => {
          setIsTransitioning(false);
        }, 50);
      }, 500);
    }, 20000);

    return () => clearInterval(interval);
  }, []);

  // Manual page switch handler
  const handlePageClick = (view: typeof activeView) => {
    if (view === activeView) return;
    setIsTransitioning(true);
    setTimeout(() => {
      setActiveView(view);
      setTimeout(() => {
        setIsTransitioning(false);
      }, 50);
    }, 300);
  };

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
    const analytics: Record<string, { totalFreight: number; totalMiles: number; orderCount: number; userId?: string }> =
      {};

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
        // Resolve display name, user_id, and office from profiles
        const profile = dispatcherProfiles[name];
        const displayName = profile?.full_name || name;
        const userId = profile?.user_id;
        const office = profile?.office || null;
        const avgTrucks = userId ? dispatcherTruckCounts?.[userId] || 0 : 0;

        return {
          name,
          displayName,
          userId,
          office,
          totalFreight: stats.totalFreight,
          totalMiles: stats.totalMiles,
          ratePerMile,
          orderCount: stats.orderCount,
          avgTrucks,
        };
      })
      .filter((d) => d.name !== "Unknown" && d.orderCount > 0);
  }, [thisWeekOrders, dispatcherProfiles, dispatcherTruckCounts]);

  // Sorted lists for Gross and RPM
  const sortedByGross = useMemo(() => {
    return [...dispatcherStats].sort((a, b) => b.totalFreight - a.totalFreight);
  }, [dispatcherStats]);

  const sortedByRPM = useMemo(() => {
    const qualified = [...dispatcherStats].filter((d) => d.avgTrucks >= 4.8);
    const list = qualified.length > 0 ? qualified : [...dispatcherStats];
    return list.sort((a, b) => b.ratePerMile - a.ratePerMile);
  }, [dispatcherStats]);

  // Top 5 and 6-10 slices
  const top5ByGross = sortedByGross.slice(0, 5);
  const top10ByGross = sortedByGross.slice(5, 10);
  const top5ByRPM = sortedByRPM.slice(0, 5);
  const top10ByRPM = sortedByRPM.slice(5, 10);

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

  // Month label for monthly views
  const monthLabel = monthStart.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const getCurrentListAndTitle = () => {
    switch (activeView) {
      case "gross5":
        return { list: top5ByGross, title: "Top 5 Dispatchers by Gross", startRank: 1 };
      case "gross10":
        return { list: top10ByGross, title: "Top 10 Dispatchers by Gross", startRank: 6 };
      case "rpm5":
        return { list: top5ByRPM, title: "Top 5 Dispatchers by RPM(5+ trucks)", startRank: 1 };
      case "rpm10":
        return { list: top10ByRPM, title: "Top 10 Dispatchers by RPM(5+ trucks)", startRank: 6 };
      case "monthlyRpm5":
        return { list: top5MonthlyRPM, title: `Top 5 Dispatchers by RPM - ${monthLabel}`, startRank: 1 };
      case "monthlyRpm10":
        return { list: top10MonthlyRPM, title: `Top 10 Dispatchers by RPM - ${monthLabel}`, startRank: 6 };
    }
  };

  const { list: currentList, title: currentTitle, startRank } = getCurrentListAndTitle();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-16 w-16 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="bg-background flex flex-col p-7" style={{ height: "90vh" }}>
      {/* Average RPM - Big number at top */}
      <div className="text-center py-7 border-b border-border">
        <p className="text-2xl text-muted-foreground uppercase tracking-widest mb-2">Average Rate Per Mile</p>
        <p className="text-[10.5rem] font-bold text-primary leading-none">{formatRPM(overallRPM)}</p>
      </div>

      {/* Rotating Leaderboard */}
      <div className="flex-1 flex flex-col justify-center mt-7">
        <div
          className={`transition-all duration-500 ease-in-out ${
            isTransitioning ? "opacity-0 translate-y-4" : "opacity-100 translate-y-0"
          }`}
        >
          <h2 className="text-2xl text-center text-muted-foreground uppercase tracking-widest mb-7">{currentTitle}</h2>

          <div className="space-y-3">
            {currentList.map((dispatcher, index) => (
              <div
                key={dispatcher.name}
                className="flex items-center justify-between px-10 py-5 bg-card rounded-lg border border-border"
              >
                {/* Rank + Name + Office */}
                <div className="flex items-center gap-5">
                  <span className="text-5xl font-bold text-muted-foreground w-14 text-center">{startRank + index}</span>
                  <span className="text-4xl font-semibold text-foreground">
                    {dispatcher.displayName}
                    {dispatcher.office && (
                      <span className="text-2xl text-muted-foreground ml-2">
                        ~{dispatcher.office === "Čačak" ? "ČAČAK" : dispatcher.office}
                      </span>
                    )}
                  </span>
                </div>

                {/* Gross + RPM (hide Gross for monthly RPM views) */}
                <div className="flex items-center gap-14">
                  {activeView !== "monthlyRpm5" && activeView !== "monthlyRpm10" && (
                    <div className="text-right">
                      <p className="text-base text-muted-foreground uppercase tracking-wide">Gross</p>
                      <p className="text-4xl font-bold text-primary">{formatCurrency(dispatcher.totalFreight)}</p>
                    </div>
                  )}
                  <div className="text-right">
                    <p className="text-base text-muted-foreground uppercase tracking-wide">RPM</p>
                    <p className="text-4xl font-bold text-emerald-600 dark:text-emerald-400">
                      {formatRPM(dispatcher.ratePerMile)}
                    </p>
                  </div>
                </div>
              </div>
            ))}

            {/* If less than 5 dispatchers, fill empty slots */}
            {Array.from({ length: Math.max(0, 5 - currentList.length) }).map((_, i) => {
              const emptyRank = startRank + currentList.length + i;
              return (
                <div
                  key={`empty-${i}`}
                  className="flex items-center justify-between px-10 py-5 bg-card/50 rounded-lg border border-border opacity-30"
                >
                  <div className="flex items-center gap-5">
                    <span className="text-5xl font-bold text-muted-foreground w-14 text-center">{emptyRank}</span>
                    <span className="text-4xl font-semibold text-muted-foreground">—</span>
                  </div>
                  <div className="flex items-center gap-14">
                    {activeView !== "monthlyRpm5" && activeView !== "monthlyRpm10" && (
                      <div className="text-right">
                        <p className="text-base text-muted-foreground uppercase tracking-wide">Gross</p>
                        <p className="text-4xl font-bold text-muted-foreground">—</p>
                      </div>
                    )}
                    <div className="text-right">
                      <p className="text-base text-muted-foreground uppercase tracking-wide">RPM</p>
                      <p className="text-4xl font-bold text-muted-foreground">—</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* View indicator dots (6 dots now, clickable) */}
        <div className="flex justify-center gap-3 mt-8">
          {viewOrder.map((view) => (
            <div
              key={view}
              onClick={() => handlePageClick(view)}
              className={`w-3 h-3 rounded-full transition-all duration-300 cursor-pointer ${
                activeView === view ? "bg-primary scale-125" : "bg-muted-foreground/30"
              }`}
            />
          ))}
        </div>
      </div>
    </div>
  );
};

export default Billboard;
