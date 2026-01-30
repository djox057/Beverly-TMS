import { useEffect, useRef, useCallback, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useDebounce } from "@/hooks/useDebounce";
import { formatInternalLoadNumber } from "@/utils/formatInternalLoadNumber";
import { useIndividualMode } from "@/contexts/IndividualModeContext";

/**
 * Result of office lookup - can be single office, multiple (ambiguous), or none
 */
type OfficeResult = 
  | { type: "found"; office: string; isLocked?: boolean; isCanceled?: boolean }
  | { type: "ambiguous"; offices: string[] }
  | { type: "not_found" }
  | { type: "error"; error: Error };

type SearchStatus = "idle" | "searching" | "found" | "not_found";

/**
 * Auto-switch engine for /reports page.
 * Handles all 3 filters with DB lookups, local checks, and guardrails.
 * 
 * CRITICAL: Searches ALL orders including locked and canceled - no date restrictions.
 */
export function useAutoSwitchOffice({
  truckDriverFilter,
  dispatchNameFilter,
  loadNumberFilter,
  activeTab,
  setActiveTab,
  offices,
  groupedReports,
}: {
  truckDriverFilter: string;
  dispatchNameFilter: string;
  loadNumberFilter: string;
  activeTab: string;
  setActiveTab: (office: string) => void;
  offices: string[];
  groupedReports: any[] | null;
}) {
  const { individualMode } = useIndividualMode();
  
  // Different debounce based on mode - longer for individual mode to give user time to type
  const debounceDelay = individualMode ? 600 : 300;
  
  // Debounce all filters
  const debouncedTruckDriver = useDebounce(truckDriverFilter, debounceDelay);
  const debouncedDispatchName = useDebounce(dispatchNameFilter, debounceDelay);
  const debouncedLoadNumber = useDebounce(loadNumberFilter, debounceDelay);

  // Prevent loops: flag to indicate we're in a search operation
  const isSearchingRef = useRef(false);
  
  // Flag to prevent re-triggering after auto-switch
  const lastAutoSwitchRef = useRef<{ filter: string; value: string } | null>(null);

  // State for ambiguous matches (to show indicator in UI)
  const [ambiguousMatch, setAmbiguousMatch] = useState<{
    filter: "truck" | "dispatch" | "load";
    offices: string[];
  } | null>(null);

  // Search status for UI feedback - use separate state to avoid object recreation loops
  const [truckSearchStatus, setTruckSearchStatus] = useState<SearchStatus>("idle");
  const [dispatchSearchStatus, setDispatchSearchStatus] = useState<SearchStatus>("idle");
  const [loadSearchStatus, setLoadSearchStatus] = useState<SearchStatus>("idle");

  // Found order metadata (for showing locked/canceled badges)
  const [foundOrderMeta, setFoundOrderMeta] = useState<{
    isLocked?: boolean;
    isCanceled?: boolean;
  } | null>(null);

  /**
   * Check ALL loaded office data, not just the active tab.
   * This avoids unnecessary DB queries when data is already in memory.
   */
  const findInAllLoadedData = useCallback((
    filterType: "truck" | "dispatch" | "load",
    searchTerm: string
  ): string | null => {
    if (!groupedReports || !searchTerm) return null;
    
    const term = searchTerm.toLowerCase().trim();
    
    // Check ALL offices in the loaded data
    for (const group of groupedReports) {
      const office = group.office;
      if (!office) continue;
      
      let found = false;
      
      switch (filterType) {
        case "truck":
          found = group.trucks?.some((truck: any) => {
            const matchesTruck = truck.truckNumber?.toLowerCase().includes(term);
            const matchesDriver = truck.driver?.toLowerCase().includes(term);
            const matchesDriver2 = truck.driver2Name?.toLowerCase().includes(term);
            return matchesTruck || matchesDriver || matchesDriver2;
          }) || false;
          break;
          
        case "dispatch":
          found = group.dispatcher?.toLowerCase().includes(term) || false;
          break;
          
        case "load":
          found = group.trucks?.some((truck: any) => 
            truck.allOrders?.some((order: any) => {
              // Check broker load number
              if (String(order.broker_load_number || '').toLowerCase().includes(term)) return true;
              
              // Check internal load number (formatted and raw)
              const internalNum = order.internal_load_number;
              const companyName = order.company?.name || order.driver1?.company?.name;
              if (internalNum) {
                const formatted = formatInternalLoadNumber(internalNum, companyName).toLowerCase();
                if (formatted.includes(term)) return true;
                if (String(internalNum).toLowerCase().includes(term)) return true;
              }
              return false;
            })
          ) || false;
          break;
      }
      
      if (found) return office;
    }
    
    return null;
  }, [groupedReports]);

  // Check if there's a local match in the currently loaded data (active tab only)
  const hasLocalMatch = useCallback((filterType: "truck" | "dispatch" | "load", searchTerm: string): boolean => {
    if (!groupedReports || !searchTerm) return false;
    
    const term = searchTerm.toLowerCase().trim();
    
    // Filter to current office only
    const currentOfficeData = groupedReports.filter(g => g.office === activeTab);
    
    switch (filterType) {
      case "truck":
        // Check truck numbers and driver names
        return currentOfficeData.some(group => 
          group.trucks?.some((truck: any) => {
            const matchesTruck = truck.truckNumber?.toLowerCase().includes(term);
            const matchesDriver = truck.driver?.toLowerCase().includes(term);
            // Also check driver2 name
            const matchesDriver2 = truck.driver2Name?.toLowerCase().includes(term);
            return matchesTruck || matchesDriver || matchesDriver2;
          })
        );
        
      case "dispatch":
        // Check dispatcher names
        return currentOfficeData.some(group => 
          group.dispatcher?.toLowerCase().includes(term)
        );
        
      case "load":
        // Check load numbers in allOrders
        return currentOfficeData.some(group => 
          group.trucks?.some((truck: any) => 
            truck.allOrders?.some((order: any) => {
              // Check broker load number
              if (String(order.broker_load_number || '').toLowerCase().includes(term)) return true;
              
              // Check internal load number (formatted and raw)
              const internalNum = order.internal_load_number;
              const companyName = order.company?.name || order.driver1?.company?.name;
              if (internalNum) {
                const formatted = formatInternalLoadNumber(internalNum, companyName).toLowerCase();
                if (formatted.includes(term)) return true;
                if (String(internalNum).toLowerCase().includes(term)) return true;
              }
              return false;
            })
          )
        );
        
      default:
        return false;
    }
  }, [groupedReports, activeTab]);

  // DB lookup for truck/driver -> office
  const lookupTruckDriverOffice = useCallback(async (searchTerm: string): Promise<OfficeResult> => {
    try {
      const term = searchTerm.trim();
      
      // First try trucks by truck_number
      const { data: truckMatches, error: truckError } = await supabase
        .from("trucks")
        .select("dispatcher_id")
        .ilike("truck_number", `%${term}%`)
        .not("dispatcher_id", "is", null)
        .limit(5);
      
      if (truckError) throw truckError;
      
      if (truckMatches && truckMatches.length > 0) {
        // Get unique dispatcher IDs
        const dispatcherIds = [...new Set(truckMatches.map(t => t.dispatcher_id))];
        
        // Resolve offices
        const { data: profileData, error: profileError } = await supabase
          .from("profiles")
          .select("office")
          .in("user_id", dispatcherIds)
          .not("office", "is", null);
        
        if (profileError) throw profileError;
        
        const foundOffices = [...new Set(profileData?.map(p => p.office).filter(Boolean) as string[])];
        
        if (foundOffices.length === 1) {
          return { type: "found", office: foundOffices[0] };
        } else if (foundOffices.length > 1) {
          return { type: "ambiguous", offices: foundOffices };
        }
      }
      
      // If no truck match, try drivers by name
      const { data: driverMatches, error: driverError } = await supabase
        .from("drivers")
        .select("dispatcher_id")
        .ilike("name", `%${term}%`)
        .not("dispatcher_id", "is", null)
        .eq("is_active", true)
        .limit(5);
      
      if (driverError) throw driverError;
      
      if (driverMatches && driverMatches.length > 0) {
        const dispatcherIds = [...new Set(driverMatches.map(d => d.dispatcher_id))];
        
        const { data: profileData, error: profileError } = await supabase
          .from("profiles")
          .select("office")
          .in("user_id", dispatcherIds)
          .not("office", "is", null);
        
        if (profileError) throw profileError;
        
        const foundOffices = [...new Set(profileData?.map(p => p.office).filter(Boolean) as string[])];
        
        if (foundOffices.length === 1) {
          return { type: "found", office: foundOffices[0] };
        } else if (foundOffices.length > 1) {
          return { type: "ambiguous", offices: foundOffices };
        }
      }
      
      return { type: "not_found" };
    } catch (error) {
      console.error("[AutoSwitch] Truck/Driver lookup error:", error);
      return { type: "error", error: error as Error };
    }
  }, []);

  // DB lookup for dispatcher name -> office
  const lookupDispatcherOffice = useCallback(async (searchTerm: string): Promise<OfficeResult> => {
    try {
      const { data: profiles, error } = await supabase
        .from("profiles")
        .select("office")
        .ilike("full_name", `%${searchTerm.trim()}%`)
        .not("office", "is", null)
        .limit(5);
      
      if (error) throw error;
      
      const foundOffices = [...new Set(profiles?.map(p => p.office).filter(Boolean) as string[])];
      
      if (foundOffices.length === 1) {
        return { type: "found", office: foundOffices[0] };
      } else if (foundOffices.length > 1) {
        return { type: "ambiguous", offices: foundOffices };
      }
      
      return { type: "not_found" };
    } catch (error) {
      console.error("[AutoSwitch] Dispatcher lookup error:", error);
      return { type: "error", error: error as Error };
    }
  }, []);

  /**
   * DB lookup for load number -> office
   * CRITICAL: NO date filters, NO status filters - searches ALL orders including locked and canceled
   */
  const lookupLoadOffice = useCallback(async (searchTerm: string): Promise<OfficeResult> => {
    try {
      const term = searchTerm.trim();
      
      // Search by broker_load_number first - NO STATUS FILTERS
      const { data: brokerMatches, error: brokerError } = await supabase
        .from("orders")
        .select("driver1_id, locked, canceled")
        .ilike("broker_load_number", `%${term}%`)
        .not("driver1_id", "is", null)
        .limit(10);
      
      if (brokerError) throw brokerError;
      
      const driver1Ids: string[] = [];
      let isLocked = false;
      let isCanceled = false;
      
      if (brokerMatches && brokerMatches.length > 0) {
        driver1Ids.push(...brokerMatches.map(o => o.driver1_id).filter(Boolean) as string[]);
        // Track if any match is locked/canceled for UI indication
        isLocked = brokerMatches.some(o => o.locked);
        isCanceled = brokerMatches.some(o => o.canceled);
      }
      
      // Also search by internal_load_number (strip suffix if present)
      const numericPart = term.split("-")[0];
      const internalNum = parseInt(numericPart, 10);
      
      if (!isNaN(internalNum)) {
        // NO STATUS FILTERS - search ALL orders
        const { data: internalMatches, error: internalError } = await supabase
          .from("orders")
          .select("driver1_id, locked, canceled")
          .eq("internal_load_number", internalNum)
          .not("driver1_id", "is", null)
          .limit(10);
        
        if (internalError) throw internalError;
        
        if (internalMatches && internalMatches.length > 0) {
          driver1Ids.push(...internalMatches.map(o => o.driver1_id).filter(Boolean) as string[]);
          if (!isLocked) isLocked = internalMatches.some(o => o.locked);
          if (!isCanceled) isCanceled = internalMatches.some(o => o.canceled);
        }
      }
      
      if (driver1Ids.length === 0) {
        return { type: "not_found" };
      }
      
      // Get dispatcher_id from drivers
      const uniqueDriverIds = [...new Set(driver1Ids)];
      const { data: driverData, error: driverError } = await supabase
        .from("drivers")
        .select("dispatcher_id")
        .in("id", uniqueDriverIds)
        .not("dispatcher_id", "is", null);
      
      if (driverError) throw driverError;
      
      const dispatcherIds = [...new Set(driverData?.map(d => d.dispatcher_id).filter(Boolean) as string[])];
      
      if (dispatcherIds.length === 0) {
        return { type: "not_found" };
      }
      
      // Get office from profiles
      const { data: profileData, error: profileError } = await supabase
        .from("profiles")
        .select("office")
        .in("user_id", dispatcherIds)
        .not("office", "is", null);
      
      if (profileError) throw profileError;
      
      const foundOffices = [...new Set(profileData?.map(p => p.office).filter(Boolean) as string[])];
      
      if (foundOffices.length === 1) {
        return { type: "found", office: foundOffices[0], isLocked, isCanceled };
      } else if (foundOffices.length > 1) {
        return { type: "ambiguous", offices: foundOffices };
      }
      
      return { type: "not_found" };
    } catch (error) {
      console.error("[AutoSwitch] Load lookup error:", error);
      return { type: "error", error: error as Error };
    }
  }, []);

  // Main effect for Truck/Driver filter
  useEffect(() => {
    if (!debouncedTruckDriver) {
      setAmbiguousMatch(prev => prev?.filter === "truck" ? null : prev);
      setTruckSearchStatus("idle");
      return;
    }
    
    // Minimum 2 chars for names, 3 for numeric (treat as truck number)
    const isNumeric = /^\d+$/.test(debouncedTruckDriver.trim());
    const minLength = isNumeric ? 3 : 2;
    if (debouncedTruckDriver.trim().length < minLength) return;
    
    // Prevent loops from auto-switch
    if (lastAutoSwitchRef.current?.filter === "truck" && lastAutoSwitchRef.current?.value === debouncedTruckDriver) {
      return;
    }
    
    if (isSearchingRef.current) return;
    
    // Local check - if match exists in CURRENT TAB, don't switch
    if (hasLocalMatch("truck", debouncedTruckDriver)) {
      setAmbiguousMatch(prev => prev?.filter === "truck" ? null : prev);
      setTruckSearchStatus("found");
      return;
    }
    
    // Check ALL loaded offices before hitting database
    const matchInLoadedData = findInAllLoadedData("truck", debouncedTruckDriver);
    if (matchInLoadedData && offices.includes(matchInLoadedData) && matchInLoadedData !== activeTab) {
      lastAutoSwitchRef.current = { filter: "truck", value: debouncedTruckDriver };
      setAmbiguousMatch(null);
      setTruckSearchStatus("found");
      setActiveTab(matchInLoadedData);
      return;
    }
    
    const search = async () => {
      isSearchingRef.current = true;
      setTruckSearchStatus("searching");
      try {
        const result = await lookupTruckDriverOffice(debouncedTruckDriver);
        
        if (result.type === "found" && offices.includes(result.office) && result.office !== activeTab) {
          lastAutoSwitchRef.current = { filter: "truck", value: debouncedTruckDriver };
          setAmbiguousMatch(null);
          setTruckSearchStatus("found");
          setActiveTab(result.office);
        } else if (result.type === "ambiguous") {
          setAmbiguousMatch({ filter: "truck", offices: result.offices });
          setTruckSearchStatus("found");
        } else if (result.type === "found") {
          // Found but in current tab already
          setTruckSearchStatus("found");
          setAmbiguousMatch(prev => prev?.filter === "truck" ? null : prev);
        } else {
          setAmbiguousMatch(prev => prev?.filter === "truck" ? null : prev);
          setTruckSearchStatus("not_found");
        }
      } finally {
        isSearchingRef.current = false;
      }
    };
    
    search();
  }, [debouncedTruckDriver, activeTab, offices, hasLocalMatch, findInAllLoadedData, lookupTruckDriverOffice, setActiveTab]);

  // Main effect for Dispatch name filter
  useEffect(() => {
    if (!debouncedDispatchName) {
      setAmbiguousMatch(prev => prev?.filter === "dispatch" ? null : prev);
      setDispatchSearchStatus("idle");
      return;
    }
    
    // Minimum 2 chars
    if (debouncedDispatchName.trim().length < 2) return;
    
    // Prevent loops
    if (lastAutoSwitchRef.current?.filter === "dispatch" && lastAutoSwitchRef.current?.value === debouncedDispatchName) {
      return;
    }
    
    if (isSearchingRef.current) return;
    
    // Local check
    if (hasLocalMatch("dispatch", debouncedDispatchName)) {
      setAmbiguousMatch(prev => prev?.filter === "dispatch" ? null : prev);
      setDispatchSearchStatus("found");
      return;
    }
    
    // Check ALL loaded offices before hitting database
    const matchInLoadedData = findInAllLoadedData("dispatch", debouncedDispatchName);
    if (matchInLoadedData && offices.includes(matchInLoadedData) && matchInLoadedData !== activeTab) {
      lastAutoSwitchRef.current = { filter: "dispatch", value: debouncedDispatchName };
      setAmbiguousMatch(null);
      setDispatchSearchStatus("found");
      setActiveTab(matchInLoadedData);
      return;
    }
    
    const search = async () => {
      isSearchingRef.current = true;
      setDispatchSearchStatus("searching");
      try {
        const result = await lookupDispatcherOffice(debouncedDispatchName);
        
        if (result.type === "found" && offices.includes(result.office) && result.office !== activeTab) {
          lastAutoSwitchRef.current = { filter: "dispatch", value: debouncedDispatchName };
          setAmbiguousMatch(null);
          setDispatchSearchStatus("found");
          setActiveTab(result.office);
        } else if (result.type === "ambiguous") {
          setAmbiguousMatch({ filter: "dispatch", offices: result.offices });
          setDispatchSearchStatus("found");
        } else if (result.type === "found") {
          setDispatchSearchStatus("found");
          setAmbiguousMatch(prev => prev?.filter === "dispatch" ? null : prev);
        } else {
          setAmbiguousMatch(prev => prev?.filter === "dispatch" ? null : prev);
          setDispatchSearchStatus("not_found");
        }
      } finally {
        isSearchingRef.current = false;
      }
    };
    
    search();
  }, [debouncedDispatchName, activeTab, offices, hasLocalMatch, findInAllLoadedData, lookupDispatcherOffice, setActiveTab]);

  // Main effect for Load number filter
  useEffect(() => {
    if (!debouncedLoadNumber) {
      setAmbiguousMatch(prev => prev?.filter === "load" ? null : prev);
      setLoadSearchStatus("idle");
      setFoundOrderMeta(null);
      return;
    }
    
    // Minimum 3 chars for load numbers
    if (debouncedLoadNumber.trim().length < 3) return;
    
    // Prevent loops
    if (lastAutoSwitchRef.current?.filter === "load" && lastAutoSwitchRef.current?.value === debouncedLoadNumber) {
      return;
    }
    
    if (isSearchingRef.current) return;
    
    // Local check
    if (hasLocalMatch("load", debouncedLoadNumber)) {
      setAmbiguousMatch(prev => prev?.filter === "load" ? null : prev);
      setLoadSearchStatus("found");
      return;
    }
    
    // Check ALL loaded offices before hitting database
    const matchInLoadedData = findInAllLoadedData("load", debouncedLoadNumber);
    if (matchInLoadedData && offices.includes(matchInLoadedData) && matchInLoadedData !== activeTab) {
      lastAutoSwitchRef.current = { filter: "load", value: debouncedLoadNumber };
      setAmbiguousMatch(null);
      setLoadSearchStatus("found");
      setActiveTab(matchInLoadedData);
      return;
    }
    
    const search = async () => {
      isSearchingRef.current = true;
      setLoadSearchStatus("searching");
      try {
        const result = await lookupLoadOffice(debouncedLoadNumber);
        
        if (result.type === "found" && offices.includes(result.office) && result.office !== activeTab) {
          lastAutoSwitchRef.current = { filter: "load", value: debouncedLoadNumber };
          setAmbiguousMatch(null);
          setLoadSearchStatus("found");
          setFoundOrderMeta({ isLocked: result.isLocked, isCanceled: result.isCanceled });
          setActiveTab(result.office);
        } else if (result.type === "ambiguous") {
          setAmbiguousMatch({ filter: "load", offices: result.offices });
          setLoadSearchStatus("found");
        } else if (result.type === "found") {
          setLoadSearchStatus("found");
          setFoundOrderMeta({ isLocked: result.isLocked, isCanceled: result.isCanceled });
          setAmbiguousMatch(prev => prev?.filter === "load" ? null : prev);
        } else {
          setAmbiguousMatch(prev => prev?.filter === "load" ? null : prev);
          setLoadSearchStatus("not_found");
          setFoundOrderMeta(null);
        }
      } finally {
        isSearchingRef.current = false;
      }
    };
    
    search();
  }, [debouncedLoadNumber, activeTab, offices, hasLocalMatch, findInAllLoadedData, lookupLoadOffice, setActiveTab]);

  // Clear the last auto-switch ref when filters are cleared
  useEffect(() => {
    if (!truckDriverFilter && !dispatchNameFilter && !loadNumberFilter) {
      lastAutoSwitchRef.current = null;
      setAmbiguousMatch(null);
      setFoundOrderMeta(null);
    }
  }, [truckDriverFilter, dispatchNameFilter, loadNumberFilter]);

  return {
    ambiguousMatch,
    searchStatus: {
      truck: truckSearchStatus,
      dispatch: dispatchSearchStatus,
      load: loadSearchStatus,
    },
    foundOrderMeta,
    isSearching: isSearchingRef.current,
  };
}
