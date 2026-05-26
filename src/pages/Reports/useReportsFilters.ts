import { useState, useEffect, useMemo, useCallback } from "react";
import { useDebounce } from "@/hooks/useDebounce";
import { isSameDay } from "date-fns";
import { parseSimpleDateTime } from "@/utils/dateUtils";
import { getChicagoToday } from "./helpers";

// Filter state hook
export function useReportsFilters() {
  // Load filter values from localStorage
  const [showEmptyTrucks, setShowEmptyTrucks] = useState(() => {
    const saved = localStorage.getItem("reports-showEmptyTrucks");
    return saved ? JSON.parse(saved) : false;
  });

  const [showNewDrivers, setShowNewDrivers] = useState(() => {
    const saved = localStorage.getItem("reports-showNewDrivers");
    return saved ? JSON.parse(saved) : false;
  });

  const [showTwoWeekNotice, setShowTwoWeekNotice] = useState(() => {
    const saved = localStorage.getItem("reports-showTwoWeekNotice");
    return saved ? JSON.parse(saved) : false;
  });

  const [showLateTrucks, setShowLateTrucks] = useState(() => {
    const saved = localStorage.getItem("reports-showLateTrucks");
    return saved ? JSON.parse(saved) : false;
  });

  const [showProblems, setShowProblems] = useState(() => {
    const saved = localStorage.getItem("reports-showProblems");
    return saved ? JSON.parse(saved) : false;
  });

  const [truckDriverFilter, setTruckDriverFilter] = useState(() => {
    return localStorage.getItem("reports-truckDriverFilter") || "";
  });

  const [dispatchNameFilter, setDispatchNameFilter] = useState(() => {
    return localStorage.getItem("reports-dispatchNameFilter") || "";
  });

  const [loadNumberFilter, setLoadNumberFilter] = useState(() => {
    return localStorage.getItem("reports-loadNumberFilter") || "";
  });

  const [companyFilter, setCompanyFilter] = useState(() => {
    return localStorage.getItem("reports-companyFilter") || "";
  });

  // Persist filter values to localStorage
  useEffect(() => {
    localStorage.setItem("reports-showEmptyTrucks", JSON.stringify(showEmptyTrucks));
  }, [showEmptyTrucks]);

  useEffect(() => {
    localStorage.setItem("reports-showNewDrivers", JSON.stringify(showNewDrivers));
  }, [showNewDrivers]);

  useEffect(() => {
    localStorage.setItem("reports-showTwoWeekNotice", JSON.stringify(showTwoWeekNotice));
  }, [showTwoWeekNotice]);

  useEffect(() => {
    localStorage.setItem("reports-showLateTrucks", JSON.stringify(showLateTrucks));
  }, [showLateTrucks]);

  useEffect(() => {
    localStorage.setItem("reports-showProblems", JSON.stringify(showProblems));
  }, [showProblems]);

  useEffect(() => {
    localStorage.setItem("reports-truckDriverFilter", truckDriverFilter);
  }, [truckDriverFilter]);

  useEffect(() => {
    localStorage.setItem("reports-dispatchNameFilter", dispatchNameFilter);
  }, [dispatchNameFilter]);

  useEffect(() => {
    localStorage.setItem("reports-loadNumberFilter", loadNumberFilter);
  }, [loadNumberFilter]);

  useEffect(() => {
    localStorage.setItem("reports-companyFilter", companyFilter);
  }, [companyFilter]);

  // Debounce filter values to prevent lag
  const debouncedTruckDriverFilter = useDebounce(truckDriverFilter, 300);
  const debouncedDispatchNameFilter = useDebounce(dispatchNameFilter, 300);
  const debouncedLoadNumberFilter = useDebounce(loadNumberFilter, 200);

  // Helper function to check if a driver is "new" (no loads or exactly 1 load with pickup today)
  const isNewDriver = useCallback((truck: any) => {
    const today = getChicagoToday();
    const realOrders = truck.allOrders?.filter((order: any) => order.notes !== "GAME|OVER") || [];

    if (realOrders.length === 0) {
      return true;
    }

    if (realOrders.length === 1) {
      const order = realOrders[0];
      if (!order.pickupStop?.datetime) return false;
      // Use parseSimpleDateTime to avoid timezone conversion
      const parsed = parseSimpleDateTime(order.pickupStop.datetime);
      const pickupDate = new Date(parsed.year, parsed.month - 1, parsed.day);
      return isSameDay(pickupDate, today);
    }
    return false;
  }, []);

  // Helper to check if truck has any game over days (only today or future)
  const hasGameOverDays = useCallback((truck: any) => {
    const today = getChicagoToday();
    today.setHours(0, 0, 0, 0);
    
    return (
      truck.lost_day_notes?.some((note: any) => {
        const noteText = note.note?.toLowerCase() || "";
        if (!noteText.includes("game over")) return false;
        
        // Only consider game over notes for today or future dates
        const noteDate = new Date(note.date + "T00:00:00");
        return noteDate >= today;
      }) || false
    );
  }, []);

  return useMemo(() => ({
    // Filter states
    showEmptyTrucks,
    setShowEmptyTrucks,
    showNewDrivers,
    setShowNewDrivers,
    showTwoWeekNotice,
    setShowTwoWeekNotice,
    showLateTrucks,
    setShowLateTrucks,
    showProblems,
    setShowProblems,
    truckDriverFilter,
    setTruckDriverFilter,
    dispatchNameFilter,
    setDispatchNameFilter,
    loadNumberFilter,
    setLoadNumberFilter,
    companyFilter,
    setCompanyFilter,

    // Debounced values
    debouncedTruckDriverFilter,
    debouncedDispatchNameFilter,
    debouncedLoadNumberFilter,
    
    // Helper functions
    isNewDriver,
    hasGameOverDays,
  }), [
    showEmptyTrucks,
    showNewDrivers,
    showTwoWeekNotice,
    showLateTrucks,
    showProblems,
    truckDriverFilter,
    dispatchNameFilter,
    loadNumberFilter,
    companyFilter,
    debouncedTruckDriverFilter,
    debouncedDispatchNameFilter,
    debouncedLoadNumberFilter,
    isNewDriver,
    hasGameOverDays,
  ]);
}
