import { useMemo, useEffect, useState } from "react";
import { useBillboardOrders } from "@/hooks/useBillboardOrders";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

const PAGE_SIZE = 1000;
const MAX_PAGES = 40;

/**
 * Supabase caps every query at 1000 rows by default. Billboard rankings are
 * computed from full-table aggregates, so truncation silently drops dispatchers.
 * This pages through the whole result set.
 */
async function fetchAllRows<T = any>(
  build: (from: number, to: number) => any,
): Promise<T[]> {
  const rows: T[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const from = page * PAGE_SIZE;
    const { data, error } = await build(from, from + PAGE_SIZE - 1);
    if (error) {
      console.error("[Billboard] paginated fetch error:", error);
      break;
    }
    if (!data || data.length === 0) break;
    rows.push(...(data as T[]));
    if (data.length < PAGE_SIZE) break;
  }
  return rows;
}


const Billboard = () => {
  const { data: orders, isLoading } = useBillboardOrders();
  const [dispatcherProfiles, setDispatcherProfiles] = useState<
    Record<string, { full_name: string; user_id: string; office: string | null }>
  >({});
  const [dispatcherTruckCounts, setDispatcherTruckCounts] = useState<Record<string, number>>();
  const [dispatcherMonthlyTruckCounts, setDispatcherMonthlyTruckCounts] = useState<Record<string, number>>();
  const [liveTruckCounts, setLiveTruckCounts] = useState<Record<string, number>>({});
  const [managerUserIds, setManagerUserIds] = useState<Set<string>>(new Set());
  const [recoveryDriverIds, setRecoveryDriverIds] = useState<Set<string>>(new Set());
  const [activeView, setActiveView] = useState<
    "gross5" | "gross10" | "rpm5" | "rpm10" | "monthlyRpm5" | "monthlyGross5" | "worstRpm5" | "worstMonthlyRpm5" | "monthlyOfficeRpm"
  >("rpm5");
  const [isTransitioning, setIsTransitioning] = useState(false);

  // Fetch profiles to resolve booked_by to display names and office
  useEffect(() => {
    const fetchProfiles = async () => {
      const profiles = await fetchAllRows<{ full_name: string | null; user_id: string; office: string | null }>(
        (from, to) =>
          supabase
            .from("profiles")
            .select("full_name, user_id, office")
            .order("user_id", { ascending: true })
            .range(from, to),
      );

      if (profiles.length > 0) {
        const profileMap = profiles.reduce(
          (acc, p) => {
            if (p.full_name) {
              acc[p.full_name] = { full_name: p.full_name, user_id: p.user_id, office: p.office };
            }
            if (p.user_id) {
              acc[p.user_id] = { full_name: p.full_name as string, user_id: p.user_id, office: p.office };
            }
            return acc;
          },
          {} as Record<string, { full_name: string; user_id: string; office: string | null }>,
        );
        setDispatcherProfiles(profileMap);
      }
    };
    fetchProfiles();

    // Fetch manager user IDs to exclude from billboard
    const fetchManagerIds = async () => {
      const roles = await fetchAllRows<{ user_id: string }>((from, to) =>
        supabase
          .from("user_roles")
          .select("user_id")
          .eq("role", "manager")
          .order("user_id", { ascending: true })
          .range(from, to),
      );
      if (roles.length > 0) {
        setManagerUserIds(new Set(roles.map((r) => r.user_id)));
      }
    };
    fetchManagerIds();

    // Fetch recovery driver IDs to exclude their loads from dispatcher stats
    const fetchRecoveryDrivers = async () => {
      const recDrivers = await fetchAllRows<{ id: string }>((from, to) =>
        supabase
          .from("drivers")
          .select("id")
          .eq("is_recovery", true)
          .order("id", { ascending: true })
          .range(from, to),
      );
      if (recDrivers.length > 0) {
        setRecoveryDriverIds(new Set(recDrivers.map((d) => d.id)));
      }
    };
    fetchRecoveryDrivers();
  }, []);

  // Fetch live (current) truck counts per dispatcher as a fallback when
  // daily snapshots are missing (e.g. before tonight's snapshot job runs,
  // or after drivers were temporarily reassigned to other dispatchers).
  useEffect(() => {
    const fetchLiveTruckCounts = async () => {
      const [activeDrivers, trucks] = await Promise.all([
        fetchAllRows<{ id: string; dispatcher_id: string | null }>((from, to) =>
          supabase
            .from("drivers")
            .select("id, dispatcher_id")
            .eq("is_active", true)
            .not("dispatcher_id", "is", null)
            .order("id", { ascending: true })
            .range(from, to),
        ),
        fetchAllRows<{ id: string; driver1_id: string | null; driver2_id: string | null }>((from, to) =>
          supabase
            .from("trucks")
            .select("id, driver1_id, driver2_id")
            .order("id", { ascending: true })
            .range(from, to),
        ),
      ]);

      if (activeDrivers.length === 0 || trucks.length === 0) return;

      const driverToDispatcher = new Map<string, string>();
      activeDrivers.forEach((d) => {
        if (d.dispatcher_id) driverToDispatcher.set(d.id, d.dispatcher_id);
      });

      const sets = new Map<string, Set<string>>();
      trucks.forEach((t) => {
        [t.driver1_id, t.driver2_id].forEach((driverId) => {
          if (!driverId) return;
          const dispatcherId = driverToDispatcher.get(driverId);
          if (!dispatcherId) return;
          if (!sets.has(dispatcherId)) sets.set(dispatcherId, new Set());
          sets.get(dispatcherId)!.add(t.id);
        });
      });

      const counts: Record<string, number> = {};
      sets.forEach((set, dispatcherId) => {
        counts[dispatcherId] = set.size;
      });
      setLiveTruckCounts(counts);
    };
    fetchLiveTruckCounts();
  }, []);

  const { weekStart, weekEnd } = useMemo(() => {
    const today = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Chicago' }));
    const dayOfWeek = today.getDay();
    const diff = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    const ws = new Date(today);
    ws.setDate(today.getDate() - diff);
    ws.setHours(0, 0, 0, 0);
    const we = new Date(ws);
    we.setDate(ws.getDate() + 6);
    we.setHours(23, 59, 59, 999);
    return { weekStart: ws, weekEnd: we };
  }, []); // [] intentional — week bounds are stable for the lifetime of this session

  // Fetch average truck counts for dispatchers this week (fallback to previous week if empty)
  useEffect(() => {
    const computeAvgCounts = (data: { dispatcher_id: string; driver_count: number }[]) => {
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
      return avgCounts;
    };

    const fetchDailyCounts = (startStr: string, endStr: string, exclusiveEnd = false) =>
      fetchAllRows<{ dispatcher_id: string; driver_count: number; truck_count?: number | null; date: string }>(
        (from, to) => {
          let q = supabase
            .from("dispatcher_daily_driver_counts")
            .select("dispatcher_id, driver_count, truck_count, date")
            .gte("date", startStr);
          q = exclusiveEnd ? q.lt("date", endStr) : q.lte("date", endStr);
          return q
            .order("date", { ascending: true })
            .order("dispatcher_id", { ascending: true })
            .range(from, to);
        },
      );

    const fetchTruckCounts = async () => {
      const startStr = weekStart.toISOString().split("T")[0];
      const endStr = weekEnd.toISOString().split("T")[0];

      const data = await fetchDailyCounts(startStr, endStr);

      if (data.length > 0) {
        const avgCounts = computeAvgCounts(data);

        // Per-dispatcher fallback: find dispatchers with no rows in this week
        // by fetching the latest 14 days as a fallback pool
        const fallbackStart = new Date(weekStart);
        fallbackStart.setDate(fallbackStart.getDate() - 14);
        const fallbackStartStr = fallbackStart.toISOString().split("T")[0];

        const fallbackData = await fetchDailyCounts(fallbackStartStr, startStr, true);

        if (fallbackData.length > 0) {
          const fallbackAvg = computeAvgCounts(fallbackData);
          // Merge: only fill gaps, don't overwrite current-week data
          Object.entries(fallbackAvg).forEach(([id, avg]) => {
            if (!(id in avgCounts)) {
              avgCounts[id] = avg;
            }
          });
        }

        setDispatcherTruckCounts(avgCounts);
        return;
      }

      // Fallback: fetch just the latest date, then query only that week
      const { data: latestRow } = await supabase
        .from("dispatcher_daily_driver_counts")
        .select("date")
        .order("date", { ascending: false })
        .limit(1);

      if (latestRow && latestRow.length > 0) {
        const latestDateObj = new Date(
          new Date(latestRow[0].date + "T12:00:00").toLocaleString('en-US', { timeZone: 'America/Chicago' })
        );
        const fallbackStart = new Date(latestDateObj);
        fallbackStart.setDate(fallbackStart.getDate() - 6);
        const fmt = (d: Date) =>
          `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        const fallback = await fetchDailyCounts(fmt(fallbackStart), fmt(latestDateObj));
        if (fallback.length > 0) {
          setDispatcherTruckCounts(computeAvgCounts(fallback));
        }
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

  const monthRangeKey = `${monthStart.getFullYear()}-${monthStart.getMonth()}`;

  // Monthly boards use month-wide average truck counts (matches Analytics)
  useEffect(() => {
    const fetchMonthlyTruckCounts = async () => {
      const fmt = (d: Date) =>
        `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      // Paginate: a full month across all dispatchers exceeds the 1000-row default cap
      const data = await fetchAllRows<any>((from, to) =>
        supabase
          .from("dispatcher_daily_driver_counts")
          .select("dispatcher_id, driver_count, truck_count, date")
          .gte("date", fmt(monthStart))
          .lte("date", fmt(monthEnd))
          .order("date", { ascending: true })
          .order("dispatcher_id", { ascending: true })
          .range(from, to),
      );
      if (data.length > 0) {

        const sums = new Map<string, { total: number; days: Set<string> }>();
        data.forEach((row: any) => {
          const id = row.dispatcher_id;
          if (!id) return;
          if (!sums.has(id)) sums.set(id, { total: 0, days: new Set() });
          const entry = sums.get(id)!;
          entry.total += Number(row.truck_count ?? row.driver_count ?? 0);
          entry.days.add(row.date);
        });
        const avg: Record<string, number> = {};
        sums.forEach((entry, id) => {
          avg[id] = entry.days.size > 0 ? entry.total / entry.days.size : 0;
        });
        setDispatcherMonthlyTruckCounts(avg);
      }
    };
    fetchMonthlyTruckCounts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [monthRangeKey]);

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
      // Exclude loads delivered by recovery drivers from dispatcher rankings
      if ((order as any).driver1Id && recoveryDriverIds.has((order as any).driver1Id)) {
        return;
      }
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
        const avgTrucks = userId
          ? dispatcherMonthlyTruckCounts?.[userId] ||
            dispatcherTruckCounts?.[userId] ||
            liveTruckCounts[userId] ||
            0
          : 0;

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
      .filter((d) => d.name !== "Unknown" && d.orderCount > 0)
      .filter((d) => !d.userId || !managerUserIds.has(d.userId));
  }, [thisMonthOrders, dispatcherProfiles, dispatcherTruckCounts, dispatcherMonthlyTruckCounts, liveTruckCounts, managerUserIds, recoveryDriverIds]);

  // Sorted monthly RPM list (filtered by 4.8+ trucks)
  const sortedMonthlyByRPM = useMemo(() => {
    return [...monthlyDispatcherStats].filter((d) => d.avgTrucks >= 4.8).sort((a, b) => b.ratePerMile - a.ratePerMile);
  }, [monthlyDispatcherStats]);

  // Sorted monthly Gross list
  const sortedMonthlyByGross = useMemo(() => {
    return [...monthlyDispatcherStats].filter((d) => d.avgTrucks >= 4.8).sort((a, b) => b.totalFreight - a.totalFreight);
  }, [monthlyDispatcherStats]);

  // Worst monthly RPM list (ascending order, filtered by 3+ trucks)
  const worstMonthlyByRPM = useMemo(() => {
    return [...monthlyDispatcherStats].filter((d) => d.avgTrucks >= 3 && d.totalMiles > 0).sort((a, b) => a.ratePerMile - b.ratePerMile);
  }, [monthlyDispatcherStats]);

  const top5MonthlyRPM = sortedMonthlyByRPM.slice(0, 5);
  const top5MonthlyGross = sortedMonthlyByGross.slice(0, 5);
  const worst5MonthlyRPM = worstMonthlyByRPM.slice(0, 5);

  // Monthly office RPM ranking (all dispatchers with an office, no truck-count filter)
  const monthlyOfficeRPM = useMemo(() => {
    const byOffice: Record<string, { totalFreight: number; totalMiles: number; orderCount: number }> = {};
    monthlyDispatcherStats.forEach((d) => {
      if (!d.office) return;
      const key = d.office === "Čačak" ? "ČAČAK" : d.office;
      if (!byOffice[key]) byOffice[key] = { totalFreight: 0, totalMiles: 0, orderCount: 0 };
      byOffice[key].totalFreight += d.totalFreight;
      byOffice[key].totalMiles += d.totalMiles;
      byOffice[key].orderCount += d.orderCount;
    });

    return Object.entries(byOffice)
      .map(([officeName, stats]) => ({
        name: officeName,
        displayName: officeName,
        userId: undefined as string | undefined,
        office: null as string | null,
        totalFreight: stats.totalFreight,
        totalMiles: stats.totalMiles,
        ratePerMile: stats.totalMiles > 0 ? stats.totalFreight / stats.totalMiles : 0,
        orderCount: stats.orderCount,
        avgTrucks: 0,
      }))
      .filter((o) => o.totalMiles > 0)
      .sort((a, b) => b.ratePerMile - a.ratePerMile);
  }, [monthlyDispatcherStats]);

  // View order now has 9 pages
  const viewOrder: Array<"rpm5" | "rpm10" | "gross5" | "gross10" | "monthlyRpm5" | "monthlyGross5" | "worstRpm5" | "worstMonthlyRpm5" | "monthlyOfficeRpm"> = [
    "rpm5",
    "rpm10",
    "gross5",
    "gross10",
    "monthlyRpm5",
    "monthlyGross5",
    "worstRpm5",
    "worstMonthlyRpm5",
    "monthlyOfficeRpm",
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
      // Exclude loads delivered by recovery drivers from dispatcher rankings
      if ((order as any).driver1Id && recoveryDriverIds.has((order as any).driver1Id)) {
        return;
      }
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
        const avgTrucks = userId
          ? dispatcherTruckCounts?.[userId] || liveTruckCounts[userId] || 0
          : 0;

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
      .filter((d) => d.name !== "Unknown" && d.orderCount > 0)
      .filter((d) => !d.userId || !managerUserIds.has(d.userId));
  }, [thisWeekOrders, dispatcherProfiles, dispatcherTruckCounts, liveTruckCounts, managerUserIds, recoveryDriverIds]);

  // Sorted lists for Gross and RPM
  const sortedByGross = useMemo(() => {
    return [...dispatcherStats].filter((d) => d.avgTrucks >= 4.8).sort((a, b) => b.totalFreight - a.totalFreight);
  }, [dispatcherStats]);

  const sortedByRPM = useMemo(() => {
    return [...dispatcherStats].filter((d) => d.avgTrucks >= 4.8).sort((a, b) => b.ratePerMile - a.ratePerMile);
  }, [dispatcherStats]);

  // Worst RPM list (ascending order, filtered by 3+ trucks)
  const worstByRPM = useMemo(() => {
    return [...dispatcherStats].filter((d) => d.avgTrucks >= 3 && d.totalMiles > 0).sort((a, b) => a.ratePerMile - b.ratePerMile);
  }, [dispatcherStats]);

  // Top 5 and 6-10 slices
  const top5ByGross = sortedByGross.slice(0, 5);
  const top10ByGross = sortedByGross.slice(5, 10);
  const top5ByRPM = sortedByRPM.slice(0, 5);
  const top10ByRPM = sortedByRPM.slice(5, 10);
  const worst5ByRPM = worstByRPM.slice(0, 5);

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

  // Helper to determine if the current view is an RPM view (show miles instead of gross)
  const isRpmView = activeView === "rpm5" || activeView === "rpm10" || activeView === "monthlyRpm5" || activeView === "worstRpm5" || activeView === "worstMonthlyRpm5" || activeView === "monthlyOfficeRpm";

  const getCurrentListAndTitle = () => {
    switch (activeView) {
      case "gross5":
        return { list: top5ByGross, title: "Top 5 Dispatchers by Gross (5+ trucks)", startRank: 1, descending: false };
      case "gross10":
        return { list: top10ByGross, title: "Top 10 Dispatchers by Gross (5+ trucks)", startRank: 6, descending: false };
      case "rpm5":
        return { list: top5ByRPM, title: "Top 5 Dispatchers by RPM (5+ trucks)", startRank: 1, descending: false };
      case "rpm10":
        return { list: top10ByRPM, title: "Top 10 Dispatchers by RPM (5+ trucks)", startRank: 6, descending: false };
      case "monthlyRpm5":
        return { list: top5MonthlyRPM, title: `Top 5 Dispatchers by RPM - ${monthLabel} (5+ trucks)`, startRank: 1, descending: false };
      case "monthlyGross5":
        return {
          list: top5MonthlyGross,
          title: `Top 5 Dispatchers by Gross - ${monthLabel} (5+ trucks)`,
          startRank: 1,
          descending: false,
        };
      case "worstRpm5":
        return { list: worst5ByRPM, title: "Worst 5 Dispatchers by RPM This Week (3+ trucks)", startRank: worstByRPM.length, descending: true };
      case "worstMonthlyRpm5":
        return { list: worst5MonthlyRPM, title: `Worst 5 Dispatchers by RPM - ${monthLabel} (3+ trucks)`, startRank: worstMonthlyByRPM.length, descending: true };
      case "monthlyOfficeRpm":
        return { list: monthlyOfficeRPM, title: `Offices by RPM - ${monthLabel}`, startRank: 1, descending: false };
    }
  };

  const { list: currentList, title: currentTitle, startRank, descending } = getCurrentListAndTitle();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-16 w-16 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="bg-background flex flex-col p-4 overflow-hidden" style={{ height: "100vh" }}>
      {/* Average RPM - Big number at top */}
      <div className="text-center py-4 border-b border-border">
        <p className="text-2xl text-muted-foreground uppercase tracking-widest mb-2">Average Rate Per Mile</p>
        <p className="text-[8.5rem] font-bold text-primary leading-none">{formatRPM(overallRPM)}</p>
      </div>

      {/* Rotating Leaderboard */}
      <div className="flex-1 flex flex-col mt-5 min-h-0">
        <div
          className={`transition-all duration-500 ease-in-out ${
            isTransitioning ? "opacity-0 translate-y-4" : "opacity-100 translate-y-0"
          }`}
        >
          <h2
            className={`text-xl text-center uppercase tracking-widest mb-3 ${
              isWorstView ? "text-destructive/80" : "text-muted-foreground"
            }`}
          >
            {isWorstView && <Flame className="inline-block h-5 w-5 mr-2 -mt-1 text-destructive/70" />}
            {currentTitle}
          </h2>

          <div className="space-y-2">
            {currentList.map((dispatcher, index) => (
              <div
                key={dispatcher.name}
                className={`flex items-center justify-between px-8 py-3 rounded-lg border ${
                  isWorstView
                    ? "bg-destructive/5 border-destructive/25 shadow-[inset_0_0_30px_hsl(var(--destructive)/0.08)]"
                    : "bg-card border-border"
                }`}
              >
                {/* Rank + Name + Office */}
                <div className="flex items-center gap-5">
                  <span
                    className={`text-4xl font-bold w-12 text-center ${
                      isWorstView ? "text-destructive/70" : "text-muted-foreground"
                    }`}
                  >
                    {descending ? startRank - index : startRank + index}
                  </span>
                  <span className="text-3xl font-semibold text-foreground">
                    {dispatcher.displayName}
                    {dispatcher.office && (
                      <span className="text-xl text-muted-foreground ml-2">
                        ~{dispatcher.office === "Čačak" ? "ČAČAK" : dispatcher.office}
                      </span>
                    )}
                  </span>
                </div>

                {/* Gross or Miles + RPM */}
                <div className="flex items-center gap-12">
                  <div className="text-right w-36 shrink-0">
                    <p className="text-xs text-muted-foreground uppercase tracking-wide">RPM</p>
                    <p
                      className={`text-3xl font-bold tabular-nums ${
                        isWorstView ? "text-destructive" : "text-emerald-600 dark:text-emerald-400"
                      }`}
                    >
                      {formatRPM(dispatcher.ratePerMile)}
                    </p>
                  </div>
                  {isRpmView ? (
                    <div className="text-right w-56 shrink-0">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide">Total Miles</p>
                      <p className="text-3xl font-bold text-primary tabular-nums">{dispatcher.totalMiles.toLocaleString()}</p>
                    </div>
                  ) : (
                    <div className="text-right w-56 shrink-0">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide">Gross</p>
                      <p className="text-3xl font-bold text-primary tabular-nums">{formatCurrency(dispatcher.totalFreight)}</p>
                    </div>
                  )}
                </div>
              </div>
            ))}


            {/* If less than 5 dispatchers, fill empty slots */}
            {Array.from({ length: Math.max(0, 5 - currentList.length) }).map((_, i) => {
              const emptyRank = startRank + currentList.length + i;
              return (
                <div
                  key={`empty-${i}`}
                  className="flex items-center justify-between px-8 py-3 bg-card/50 rounded-lg border border-border opacity-30"
                >
                  <div className="flex items-center gap-5">
                    <span className="text-4xl font-bold text-muted-foreground w-12 text-center">{emptyRank}</span>
                    <span className="text-3xl font-semibold text-muted-foreground">—</span>
                  </div>
                  <div className="flex items-center gap-12">
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide">RPM</p>
                      <p className="text-3xl font-bold text-muted-foreground">—</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted-foreground uppercase tracking-wide">
                        {isRpmView ? "Total Miles" : "Gross"}
                      </p>
                      <p className="text-3xl font-bold text-muted-foreground">—</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* View indicator dots (6 dots now, clickable) */}
        <div className="flex justify-center gap-3 mt-3">
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
