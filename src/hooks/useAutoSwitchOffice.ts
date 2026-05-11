import { useEffect, useRef, useCallback, useState, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatInternalLoadNumber } from "@/utils/formatInternalLoadNumber";
import { isValidUUID } from "@/utils/validation";
import { useIndividualMode } from "@/contexts/IndividualModeContext";

/**
 * Word-boundary match: term matches the start of any word in `text`,
 * or `text` equals `term` exactly (case-insensitive).
 * Used to prefer "Sam Smith" over "Marsam Jones" when searching "sam".
 */
const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const isWordBoundaryMatch = (text: string | null | undefined, term: string): boolean => {
  if (!text) return false;
  const t = String(text).toLowerCase();
  const q = term.toLowerCase().trim();
  if (!q) return false;
  if (t === q) return true;
  // Word boundary: start of string or after whitespace/dash/slash
  return new RegExp(`(^|[\\s\\-/])${escapeRegExp(q)}`, "i").test(text);
};

/**
 * Result of office lookup - can be single office, multiple (ambiguous), or none
 */
type OfficeResult = 
  | { type: "found"; office: string; isLocked?: boolean; isCanceled?: boolean; pickupDate?: string; driverId?: string }
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
  setSpotlightDriverId,
}: {
  truckDriverFilter: string;
  dispatchNameFilter: string;
  loadNumberFilter: string;
  activeTab: string;
  setActiveTab: (office: string) => void;
  offices: string[];
  groupedReports: any[] | null;
  /**
   * Optional callback to set a "spotlight" driver id when the load# search
   * resolves to a driver that lives in a different office than the active tab.
   * Reports.tsx owns this state and feeds it into the data hook so the matched
   * driver's row can render before the rest of the office finishes loading.
   */
  setSpotlightDriverId?: (driverId: string | null) => void;
}) {
  const { individualMode } = useIndividualMode();
  
  // Values are already debounced by the caller (useReportsFilters at 300ms)
  const debouncedTruckDriver = truckDriverFilter;
  const debouncedDispatchName = dispatchNameFilter;
  const debouncedLoadNumber = loadNumberFilter;

  // Prevent loops: flag to indicate we're in a search operation
  const isSearchingRef = useRef(false);
  
  // Flag to prevent re-triggering after auto-switch - tracks filter value AND target office
  const lastAutoSwitchRef = useRef<{ filter: string; value: string; targetOffice: string } | null>(null);
  
  // Timestamp to prevent rapid re-searches after tab switch (increased to 2000ms to allow row clicks)
  const lastSwitchTimeRef = useRef<number>(0);
  
  // Track when a local match exists - stop auto-switching entirely until filter changes
  const localMatchFoundRef = useRef<{ filter: string; value: string; office: string } | null>(null);
  
  // Track the previous activeTab to detect MANUAL tab switches (vs auto-switch)
  const prevActiveTabRef = useRef<string>(activeTab);
  
  // Track when user manually switched tabs - should block auto-switch for this search term
  const manualTabSwitchRef = useRef<{ filter: string; value: string } | null>(null);
  
  // ROBUST user override ref - blocks auto-switch indefinitely until filter changes
  // This is separate from manualTabSwitchRef to prevent timing issues
  const userOverrideRef = useRef<{
    filter: "truck" | "dispatch" | "load";
    value: string;
  } | null>(null);

  // Track terms that have already been searched via DB to prevent infinite retries
  // when a search term doesn't match anything (not_found / error)
  const lastSearchedTermsRef = useRef<{
    truck?: string;
    dispatch?: string;
    load?: string;
  }>({});

  // Circuit breaker: track consecutive DB errors to back off during overload
  const dbErrorCountRef = useRef(0);
  const dbErrorBackoffUntilRef = useRef(0);
  const MAX_CONSECUTIVE_ERRORS = 3;
  const ERROR_BACKOFF_MS = 30000; // 30s backoff after max errors

  // State for ambiguous matches (to show indicator in UI)
  const [ambiguousMatch, setAmbiguousMatch] = useState<{
    filter: "truck" | "dispatch" | "load";
    offices: string[];
  } | null>(null);

  // Search status for UI feedback - use separate state to avoid object recreation loops
  const [truckSearchStatus, setTruckSearchStatus] = useState<SearchStatus>("idle");
  const [dispatchSearchStatus, setDispatchSearchStatus] = useState<SearchStatus>("idle");
  const [loadSearchStatus, setLoadSearchStatus] = useState<SearchStatus>("idle");

  // Found order metadata (for showing locked/canceled badges + date navigation)
  const [foundOrderMeta, setFoundOrderMeta] = useState<{
    isLocked?: boolean;
    isCanceled?: boolean;
    pickupDate?: string;
  } | null>(null);

  /**
   * Normalize office values coming from DB / loaded data to match the exact `offices` tab values.
   * Fixes cases like: "ČAČAK" vs "Čačak" or missing diacritics ("Cacak").
   */
  const officeKey = useCallback((value: string) => {
    return value
      .trim()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "") // strip diacritics
      .toLowerCase();
  }, []);

  const normalizeToKnownOffice = useCallback((value?: string | null): string | null => {
    if (!value) return null;
    const key = officeKey(value);
    const match = offices.find((o) => officeKey(o) === key);
    return match ?? null;
  }, [offices, officeKey]);

  /**
   * Compute the best match rank per office for a given filter+term.
   * rank 1 = exact / word-boundary match (preferred)
   * rank 2 = pure substring fallback
   * Only returns offices whose best rank equals the global best rank,
   * so substring false positives are dropped when an exact match exists somewhere.
   */
  const findOfficeMatches = useCallback((
    filterType: "truck" | "dispatch" | "load",
    searchTerm: string,
  ): Array<{ office: string; rank: 1 | 2 }> => {
    if (!groupedReports || !searchTerm) return [];
    const term = searchTerm.toLowerCase().trim();
    if (!term) return [];
    const isNumeric = /^\d+$/.test(term);
    const numericPart = term.split("-")[0];
    const numericPartIsDigits = /^\d+$/.test(numericPart) && numericPart.length > 0;

    const all: Array<{ office: string; rank: 1 | 2 }> = [];

    for (const group of groupedReports) {
      const office = normalizeToKnownOffice(group.office);
      if (!office) continue;

      let bestRank: 1 | 2 | null = null;
      const bump = (r: 1 | 2) => {
        if (bestRank === null || r < bestRank) bestRank = r;
      };

      if (filterType === "truck") {
        group.trucks?.forEach((truck: any) => {
          const truckNumberValue = String(truck.truckNumber ?? truck.truck_number ?? "").toLowerCase();
          if (isNumeric) {
            // Truck number numeric search is exact-only
            if (truckNumberValue === term) bump(1);
          } else {
            if (truckNumberValue === term) bump(1);
            else if (truckNumberValue.includes(term)) bump(2);
            // Driver names — prefer word-boundary
            if (isWordBoundaryMatch(truck.driver, term) || isWordBoundaryMatch(truck.driver2Name, term)) {
              bump(1);
            } else if (
              truck.driver?.toLowerCase().includes(term) ||
              truck.driver2Name?.toLowerCase().includes(term)
            ) {
              bump(2);
            }
          }
        });
      } else if (filterType === "dispatch") {
        if (isWordBoundaryMatch(group.dispatcher, term)) bump(1);
        else if (group.dispatcher?.toLowerCase().includes(term)) bump(2);
      } else if (filterType === "load") {
        group.trucks?.forEach((truck: any) => {
          truck.allOrders?.forEach((order: any) => {
            const broker = String(order.broker_load_number ?? "").toLowerCase();
            const internal = String(order.internal_load_number ?? "").toLowerCase();
            const companyName = order.company?.name || order.driver1?.company?.name;
            const formatted = order.internal_load_number
              ? formatInternalLoadNumber(order.internal_load_number, companyName).toLowerCase()
              : "";

            // Exact / boundary matches → rank 1
            if (broker && broker === term) bump(1);
            if (numericPartIsDigits && (internal === numericPart || internal.startsWith(numericPart + "-"))) {
              bump(1);
            }
            if (formatted && formatted === term) bump(1);

            // Substring fallbacks → rank 2
            if (broker && broker.includes(term)) bump(2);
            if (internal && internal.includes(term)) bump(2);
            if (formatted && formatted.includes(term)) bump(2);
          });
        });
      }

      if (bestRank !== null) all.push({ office, rank: bestRank });
    }

    if (all.length === 0) return [];
    const minRank = Math.min(...all.map((m) => m.rank)) as 1 | 2;
    return all.filter((m) => m.rank === minRank);
  }, [groupedReports, normalizeToKnownOffice]);

  /**
   * Check ALL loaded office data, not just the active tab.
   * Returns the office to switch to, preferring the active tab when it
   * is among the best-ranked matches.
   */
  const findInAllLoadedData = useCallback((
    filterType: "truck" | "dispatch" | "load",
    searchTerm: string
  ): string | null => {
    const matches = findOfficeMatches(filterType, searchTerm);
    if (matches.length === 0) return null;
    const currentInMatches = matches.find((m) => m.office === activeTab);
    if (currentInMatches) return currentInMatches.office;
    return matches[0].office;
  }, [findOfficeMatches, activeTab]);

  // Local-tab match: only true if the active tab carries the GLOBAL best rank.
  // Otherwise we prefer to switch to the office that has the better-ranked match.
  const hasLocalMatch = useCallback((
    filterType: "truck" | "dispatch" | "load",
    searchTerm: string,
  ): boolean => {
    const matches = findOfficeMatches(filterType, searchTerm);
    if (matches.length === 0) return false;
    return matches.some((m) => m.office === activeTab);
  }, [findOfficeMatches, activeTab]);

  // DB lookup for truck/driver -> office
  const lookupTruckDriverOffice = useCallback(async (searchTerm: string): Promise<OfficeResult> => {
    try {
      const term = searchTerm.trim();
      const isNumeric = /^\d+$/.test(term);

      const resolveOfficesFromDispatcherIds = async (dispatcherIds: string[]) => {
        if (dispatcherIds.length === 0) return [] as string[];

        const { data: profileData, error: profileError } = await supabase
          .from("profiles")
          .select("office")
          .in("user_id", dispatcherIds)
          .not("office", "is", null);

        if (profileError) throw profileError;

        return [...new Set(profileData?.map((p) => p.office).filter(Boolean) as string[])];
      };

      // Truck office should be derived from the currently assigned driver(s),
      // not from trucks.dispatcher_id (which can be stale/incorrect).
      const resolveOfficesFromTruckRows = async (
        truckRows: Array<{ driver1_id: string | null; driver2_id: string | null }>
      ) => {
        const driverIds = [
          ...new Set(
            truckRows
              .flatMap((t) => [t.driver1_id, t.driver2_id])
              .filter(Boolean) as string[]
          ),
        ];

        if (driverIds.length === 0) return [] as string[];

        const { data: driverData, error: driverError } = await supabase
          .from("drivers")
          .select("dispatcher_id")
          .in("id", driverIds)
          .not("dispatcher_id", "is", null);

        if (driverError) throw driverError;

        const dispatcherIds = [
          ...new Set(
            (driverData ?? []).map((d) => d.dispatcher_id).filter((id): id is string => Boolean(id) && isValidUUID(id))
          ),
        ];

        return resolveOfficesFromDispatcherIds(dispatcherIds);
      };
      
      // 1) If numeric, ONLY do exact match - no prefix/partial matching
      if (isNumeric) {
        const { data: exactTrucks, error: exactTruckError } = await supabase
          .from("trucks")
          .select("driver1_id, driver2_id")
          .eq("truck_number", term)
          .limit(5);

        // Also try with trimmed match via ilike for truck_numbers with trailing spaces
        const { data: ilikeTrucks, error: ilikeTruckError } = await supabase
          .from("trucks")
          .select("driver1_id, driver2_id")
          .ilike("truck_number", `${term}%`)
          .limit(5);

        if (exactTruckError) throw exactTruckError;

        const allTruckMatches = [
          ...((exactTrucks && !exactTruckError) ? exactTrucks : []),
          ...((ilikeTrucks && !ilikeTruckError) ? ilikeTrucks : []),
        ];
        // Deduplicate by driver1_id+driver2_id combo
        const seen = new Set<string>();
        const uniqueTrucks = allTruckMatches.filter(t => {
          const key = `${t.driver1_id}-${t.driver2_id}`;
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });

        if (uniqueTrucks.length > 0) {
          const foundOffices = await resolveOfficesFromTruckRows(uniqueTrucks);

          if (foundOffices.length === 1) return { type: "found", office: foundOffices[0] };
          if (foundOffices.length > 1) return { type: "ambiguous", offices: foundOffices };
        }
        
        // For numeric searches, if no exact match found, return not_found immediately
        // (don't fall through to prefix/substring matching)
      } else {
        // 2) For non-numeric searches: substring match for names/alphanumerics
        const { data: truckMatches, error: truckError } = await supabase
          .from("trucks")
          .select("driver1_id, driver2_id")
          .ilike("truck_number", `%${term}%`)
          .limit(10);

        if (truckError) throw truckError;

        if (truckMatches && truckMatches.length > 0) {
          const foundOffices = await resolveOfficesFromTruckRows(truckMatches);

          if (foundOffices.length === 1) {
            return { type: "found", office: foundOffices[0] };
          } else if (foundOffices.length > 1) {
            return { type: "ambiguous", offices: foundOffices };
          }
        }
      }
      
      // If no truck match, try drivers by name
      const { data: driverMatches, error: driverError } = await supabase
        .from("drivers")
        .select("name, dispatcher_id")
        .ilike("name", `%${term}%`)
        .not("dispatcher_id", "is", null)
        .eq("is_active", true)
        .limit(20);
      
      if (driverError) throw driverError;
      
      if (driverMatches && driverMatches.length > 0) {
        // Prefer word-boundary matches over substring matches
        const ranked = driverMatches.map((d) => ({
          dispatcher_id: d.dispatcher_id,
          rank: isWordBoundaryMatch((d as any).name, term) ? 1 : 2,
        }));
        const minRank = Math.min(...ranked.map((r) => r.rank));
        const filtered = ranked.filter((r) => r.rank === minRank);
        const dispatcherIds = [...new Set(filtered.map(d => d.dispatcher_id).filter((id): id is string => Boolean(id) && isValidUUID(id)))];
        
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
      const term = searchTerm.trim();
      const { data: profiles, error } = await supabase
        .from("profiles")
        .select("full_name, office")
        .ilike("full_name", `%${term}%`)
        .not("office", "is", null)
        .limit(20);
      
      if (error) throw error;
      
      const rows = (profiles ?? []) as Array<{ full_name: string | null; office: string | null }>;
      // Prefer word-boundary matches over substring matches
      const ranked = rows.map((p) => ({
        office: p.office,
        rank: isWordBoundaryMatch(p.full_name, term) ? 1 : 2,
      }));
      const minRank = ranked.length ? Math.min(...ranked.map((r) => r.rank)) : 2;
      const filtered = ranked.filter((r) => r.rank === minRank);
      const foundOffices = [...new Set(filtered.map(r => r.office).filter(Boolean) as string[])];
      
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

      // Single round-trip: RPC joins orders -> drivers -> profiles server-side.
      // Searches ALL orders including locked and canceled (no status/date filters).
      const { data, error } = await supabase.rpc("lookup_load_office", { p_term: term });

      if (error) throw error;

      const rows = (data ?? []) as Array<{
        office: string;
        is_locked: boolean | null;
        is_canceled: boolean | null;
        pickup_datetime: string | null;
        driver1_id: string | null;
      }>;

      if (rows.length === 0) return { type: "not_found" };

      const isLocked = rows.some(r => r.is_locked === true);
      const isCanceled = rows.some(r => r.is_canceled === true);
      const pickupDate = rows.find(r => r.pickup_datetime)?.pickup_datetime ?? undefined;
      const firstDriverId = rows.find(r => r.driver1_id)?.driver1_id ?? undefined;
      const foundOffices = [...new Set(rows.map(r => r.office).filter(Boolean))];

      if (foundOffices.length === 1) {
        return { type: "found", office: foundOffices[0], isLocked, isCanceled, pickupDate, driverId: firstDriverId ?? undefined };
      }
      if (foundOffices.length > 1) {
        return { type: "ambiguous", offices: foundOffices };
      }
      return { type: "not_found" };
    } catch (error) {
      console.error("[AutoSwitch] Load lookup error:", error);
      return { type: "error", error: error as Error };
    }
  }, []);

  // Detect manual tab switches (user clicked a tab, not auto-switch)
  // This uses BOTH manualTabSwitchRef (legacy) AND userOverrideRef (more robust)
  useEffect(() => {
    const prevTab = prevActiveTabRef.current;
    const lastSwitch = lastAutoSwitchRef.current;
    
    // If tab changed at all
    if (prevTab !== activeTab) {
      // If we previously auto-switched AND the user is now on a DIFFERENT tab than the target,
      // they're explicitly overriding our switch. Block ALL future auto-switches for this search.
      if (lastSwitch && lastSwitch.targetOffice !== activeTab) {
        // User overrode the auto-switch - set BOTH refs for maximum protection
        if (debouncedTruckDriver && debouncedTruckDriver.trim().length >= 2) {
          manualTabSwitchRef.current = { filter: "truck", value: debouncedTruckDriver };
          userOverrideRef.current = { filter: "truck", value: debouncedTruckDriver };
        } else if (debouncedDispatchName && debouncedDispatchName.trim().length >= 2) {
          manualTabSwitchRef.current = { filter: "dispatch", value: debouncedDispatchName };
          userOverrideRef.current = { filter: "dispatch", value: debouncedDispatchName };
        } else if (debouncedLoadNumber && debouncedLoadNumber.trim().length >= 3) {
          manualTabSwitchRef.current = { filter: "load", value: debouncedLoadNumber };
          userOverrideRef.current = { filter: "load", value: debouncedLoadNumber };
        }
      }
    }
    
    prevActiveTabRef.current = activeTab;
  }, [activeTab, debouncedTruckDriver, debouncedDispatchName, debouncedLoadNumber]);

  // Main effect for Truck/Driver filter
  useEffect(() => {
    if (!debouncedTruckDriver) {
      setAmbiguousMatch(prev => prev?.filter === "truck" ? null : prev);
      setTruckSearchStatus("idle");
      localMatchFoundRef.current = null;
      // Clear ALL override refs when filter is cleared
      if (manualTabSwitchRef.current?.filter === "truck") {
        manualTabSwitchRef.current = null;
      }
      if (userOverrideRef.current?.filter === "truck") {
        userOverrideRef.current = null;
      }
      delete lastSearchedTermsRef.current.truck;
      return;
    }
    
    // Minimum 2 chars for names, 3 for numeric (treat as truck number)
    const isNumeric = /^\d+$/.test(debouncedTruckDriver.trim());
    const minLength = isNumeric ? 3 : 2;
    if (debouncedTruckDriver.trim().length < minLength) return;
    
    // CRITICAL: Check userOverrideRef FIRST - this is the most robust check
    const userOverride = userOverrideRef.current;
    if (userOverride?.filter === "truck" && userOverride?.value === debouncedTruckDriver) {
      // User overrode - do NOT auto-switch, just show found status
      setTruckSearchStatus("found");
      return;
    }
    
    // Legacy check: If user manually switched tabs while this search was active
    const manualSwitch = manualTabSwitchRef.current;
    if (manualSwitch?.filter === "truck" && manualSwitch?.value === debouncedTruckDriver) {
      setTruckSearchStatus("found");
      return;
    }
    
    // If we already found a local match for this exact search, don't re-search ever
    const localMatch = localMatchFoundRef.current;
    if (localMatch?.filter === "truck" && localMatch?.value === debouncedTruckDriver) {
      setTruckSearchStatus("found");
      return;
    }
    
    // Prevent loops: check if we already switched for this exact filter value AND we're on the target office
    const lastSwitch = lastAutoSwitchRef.current;
    if (lastSwitch?.filter === "truck" && lastSwitch?.value === debouncedTruckDriver && lastSwitch?.targetOffice === activeTab) {
      // Already switched to target office for this search, don't search again
      setTruckSearchStatus("found");
      return;
    }
    
    // Prevent rapid re-triggering after tab switch (2000ms to allow clicking on rows)
    const timeSinceLastSwitch = Date.now() - lastSwitchTimeRef.current;
    if (timeSinceLastSwitch < 2000) {
      return;
    }
    
    if (isSearchingRef.current) return;
    
    // Already searched this exact term via DB - don't hit DB again
    if (lastSearchedTermsRef.current.truck === debouncedTruckDriver) {
      return;
    }
    
    // Local check - if match exists in CURRENT TAB, don't switch and REMEMBER this
    if (hasLocalMatch("truck", debouncedTruckDriver)) {
      localMatchFoundRef.current = { filter: "truck", value: debouncedTruckDriver, office: activeTab };
      setAmbiguousMatch(prev => prev?.filter === "truck" ? null : prev);
      setTruckSearchStatus("found");
      return;
    }
    
    // Check ALL loaded offices before hitting database
    const matchInLoadedData = findInAllLoadedData("truck", debouncedTruckDriver);
    const loadedTargetOffice = normalizeToKnownOffice(matchInLoadedData);
    if (loadedTargetOffice && loadedTargetOffice !== activeTab) {
      lastAutoSwitchRef.current = { filter: "truck", value: debouncedTruckDriver, targetOffice: loadedTargetOffice };
      lastSwitchTimeRef.current = Date.now();
      setAmbiguousMatch(null);
      setTruckSearchStatus("found");
      setActiveTab(loadedTargetOffice);
      return;
    }
    
    // Circuit breaker: skip DB lookup if too many consecutive errors
    if (dbErrorCountRef.current >= MAX_CONSECUTIVE_ERRORS && Date.now() < dbErrorBackoffUntilRef.current) {
      console.warn(`[AutoSwitch] Circuit breaker active, skipping truck DB lookup until ${new Date(dbErrorBackoffUntilRef.current).toLocaleTimeString()}`);
      setTruckSearchStatus("not_found");
      lastSearchedTermsRef.current.truck = debouncedTruckDriver;
      return;
    }
    
    const search = async () => {
      isSearchingRef.current = true;
      setTruckSearchStatus("searching");
      try {
        const result = await lookupTruckDriverOffice(debouncedTruckDriver);

        // Reset circuit breaker on successful DB call (even if not_found)
        if (result.type !== "error") {
          dbErrorCountRef.current = 0;
        } else {
          dbErrorCountRef.current++;
          if (dbErrorCountRef.current >= MAX_CONSECUTIVE_ERRORS) {
            dbErrorBackoffUntilRef.current = Date.now() + ERROR_BACKOFF_MS;
            console.warn(`[AutoSwitch] Circuit breaker tripped after ${MAX_CONSECUTIVE_ERRORS} errors, backing off for ${ERROR_BACKOFF_MS / 1000}s`);
          }
        }

        if (result.type === "found") {
          const targetOffice = normalizeToKnownOffice(result.office);
          if (targetOffice && targetOffice !== activeTab) {
            lastAutoSwitchRef.current = { filter: "truck", value: debouncedTruckDriver, targetOffice: targetOffice };
            lastSwitchTimeRef.current = Date.now();
            setAmbiguousMatch(null);
            setTruckSearchStatus("found");
            setActiveTab(targetOffice);
            return;
          }
        }

        if (result.type === "ambiguous") {
          const normalized = [...new Set(result.offices.map(normalizeToKnownOffice).filter(Boolean) as string[])];
          if (normalized.length === 1) {
            const targetOffice = normalized[0];
            if (targetOffice !== activeTab) {
              lastAutoSwitchRef.current = { filter: "truck", value: debouncedTruckDriver, targetOffice };
              lastSwitchTimeRef.current = Date.now();
              setAmbiguousMatch(null);
              setTruckSearchStatus("found");
              setActiveTab(targetOffice);
              return;
            }
          } else if (normalized.length > 1) {
            setAmbiguousMatch({ filter: "truck", offices: normalized });
            setTruckSearchStatus("found");
            return;
          }
        }

        if (result.type === "found") {
          setTruckSearchStatus("found");
          setAmbiguousMatch(prev => prev?.filter === "truck" ? null : prev);
        } else {
          setAmbiguousMatch(prev => prev?.filter === "truck" ? null : prev);
          setTruckSearchStatus("not_found");
        }
      } finally {
        isSearchingRef.current = false;
        lastSearchedTermsRef.current.truck = debouncedTruckDriver;
      }
    };
    
    search();
  // NOTE: Remove hasLocalMatch and findInAllLoadedData from deps - they use refs internally for stable checks
  }, [debouncedTruckDriver, activeTab, lookupTruckDriverOffice, setActiveTab, normalizeToKnownOffice]);

  // Main effect for Dispatch name filter
  useEffect(() => {
    if (!debouncedDispatchName) {
      setAmbiguousMatch(prev => prev?.filter === "dispatch" ? null : prev);
      setDispatchSearchStatus("idle");
      localMatchFoundRef.current = null;
      // Clear ALL override refs when filter is cleared
      if (manualTabSwitchRef.current?.filter === "dispatch") {
        manualTabSwitchRef.current = null;
      }
      if (userOverrideRef.current?.filter === "dispatch") {
        userOverrideRef.current = null;
      }
      delete lastSearchedTermsRef.current.dispatch;
      return;
    }
    
    // Minimum 2 chars
    if (debouncedDispatchName.trim().length < 2) return;
    
    // CRITICAL: Check userOverrideRef FIRST
    const userOverride = userOverrideRef.current;
    if (userOverride?.filter === "dispatch" && userOverride?.value === debouncedDispatchName) {
      setDispatchSearchStatus("found");
      return;
    }
    
    // Legacy check
    const manualSwitch = manualTabSwitchRef.current;
    if (manualSwitch?.filter === "dispatch" && manualSwitch?.value === debouncedDispatchName) {
      setDispatchSearchStatus("found");
      return;
    }
    
    // If we already found a local match for this exact search, don't re-search
    const localMatch = localMatchFoundRef.current;
    if (localMatch?.filter === "dispatch" && localMatch?.value === debouncedDispatchName) {
      setDispatchSearchStatus("found");
      return;
    }
    
    // Prevent loops: check if we already switched for this exact filter value AND we're on the target office
    const lastSwitch = lastAutoSwitchRef.current;
    if (lastSwitch?.filter === "dispatch" && lastSwitch?.value === debouncedDispatchName && lastSwitch?.targetOffice === activeTab) {
      setDispatchSearchStatus("found");
      return;
    }
    
    // Prevent rapid re-triggering after tab switch (2000ms)
    const timeSinceLastSwitch = Date.now() - lastSwitchTimeRef.current;
    if (timeSinceLastSwitch < 2000) {
      return;
    }
    
    if (isSearchingRef.current) return;
    
    // Already searched this exact term via DB - don't hit DB again
    if (lastSearchedTermsRef.current.dispatch === debouncedDispatchName) {
      return;
    }
    
    // Local check - remember if found locally
    if (hasLocalMatch("dispatch", debouncedDispatchName)) {
      localMatchFoundRef.current = { filter: "dispatch", value: debouncedDispatchName, office: activeTab };
      setAmbiguousMatch(prev => prev?.filter === "dispatch" ? null : prev);
      setDispatchSearchStatus("found");
      return;
    }
    
    // Check ALL loaded offices before hitting database
    const matchInLoadedData = findInAllLoadedData("dispatch", debouncedDispatchName);
    const loadedTargetOffice = normalizeToKnownOffice(matchInLoadedData);
    if (loadedTargetOffice && loadedTargetOffice !== activeTab) {
      lastAutoSwitchRef.current = { filter: "dispatch", value: debouncedDispatchName, targetOffice: loadedTargetOffice };
      lastSwitchTimeRef.current = Date.now();
      setAmbiguousMatch(null);
      setDispatchSearchStatus("found");
      setActiveTab(loadedTargetOffice);
      return;
    }
    
    // Circuit breaker
    if (dbErrorCountRef.current >= MAX_CONSECUTIVE_ERRORS && Date.now() < dbErrorBackoffUntilRef.current) {
      setDispatchSearchStatus("not_found");
      lastSearchedTermsRef.current.dispatch = debouncedDispatchName;
      return;
    }
    
    const search = async () => {
      isSearchingRef.current = true;
      setDispatchSearchStatus("searching");
      try {
        const result = await lookupDispatcherOffice(debouncedDispatchName);

        if (result.type !== "error") {
          dbErrorCountRef.current = 0;
        } else {
          dbErrorCountRef.current++;
          if (dbErrorCountRef.current >= MAX_CONSECUTIVE_ERRORS) {
            dbErrorBackoffUntilRef.current = Date.now() + ERROR_BACKOFF_MS;
          }
        }

        if (result.type === "found") {
          const targetOffice = normalizeToKnownOffice(result.office);
          if (targetOffice && targetOffice !== activeTab) {
            lastAutoSwitchRef.current = { filter: "dispatch", value: debouncedDispatchName, targetOffice };
            lastSwitchTimeRef.current = Date.now();
            setAmbiguousMatch(null);
            setDispatchSearchStatus("found");
            setActiveTab(targetOffice);
            return;
          }
        }

        if (result.type === "ambiguous") {
          const normalized = [...new Set(result.offices.map(normalizeToKnownOffice).filter(Boolean) as string[])];
          if (normalized.length === 1) {
            const targetOffice = normalized[0];
            if (targetOffice !== activeTab) {
              lastAutoSwitchRef.current = { filter: "dispatch", value: debouncedDispatchName, targetOffice };
              lastSwitchTimeRef.current = Date.now();
              setAmbiguousMatch(null);
              setDispatchSearchStatus("found");
              setActiveTab(targetOffice);
              return;
            }
          } else if (normalized.length > 1) {
            setAmbiguousMatch({ filter: "dispatch", offices: normalized });
            setDispatchSearchStatus("found");
            return;
          }
        }

        if (result.type === "found") {
          setDispatchSearchStatus("found");
          setAmbiguousMatch(prev => prev?.filter === "dispatch" ? null : prev);
        } else {
          setAmbiguousMatch(prev => prev?.filter === "dispatch" ? null : prev);
          setDispatchSearchStatus("not_found");
        }
      } finally {
        isSearchingRef.current = false;
        lastSearchedTermsRef.current.dispatch = debouncedDispatchName;
      }
    };
    
    search();
  // NOTE: Remove hasLocalMatch and findInAllLoadedData from deps - they use refs internally for stable checks
  }, [debouncedDispatchName, activeTab, lookupDispatcherOffice, setActiveTab, normalizeToKnownOffice]);

  // Main effect for Load number filter
  useEffect(() => {
    if (!debouncedLoadNumber) {
      setAmbiguousMatch(prev => prev?.filter === "load" ? null : prev);
      setLoadSearchStatus("idle");
      setFoundOrderMeta(null);
      localMatchFoundRef.current = null;
      // Clear spotlight when load filter is cleared
      setSpotlightDriverId?.(null);
      // Clear ALL override refs when filter is cleared
      if (manualTabSwitchRef.current?.filter === "load") {
        manualTabSwitchRef.current = null;
      }
      if (userOverrideRef.current?.filter === "load") {
        userOverrideRef.current = null;
      }
      delete lastSearchedTermsRef.current.load;
      return;
    }
    
    // Minimum 3 chars for load numbers
    if (debouncedLoadNumber.trim().length < 3) return;
    
    // CRITICAL: Check userOverrideRef FIRST
    const userOverride = userOverrideRef.current;
    if (userOverride?.filter === "load" && userOverride?.value === debouncedLoadNumber) {
      setLoadSearchStatus("found");
      return;
    }
    
    // Legacy check
    const manualSwitch = manualTabSwitchRef.current;
    if (manualSwitch?.filter === "load" && manualSwitch?.value === debouncedLoadNumber) {
      setLoadSearchStatus("found");
      return;
    }
    
    // If we already found a local match for this exact search, don't re-search
    const localMatch = localMatchFoundRef.current;
    if (localMatch?.filter === "load" && localMatch?.value === debouncedLoadNumber) {
      setLoadSearchStatus("found");
      return;
    }
    
    // Prevent loops: check if we already switched for this exact filter value AND we're on the target office
    const lastSwitch = lastAutoSwitchRef.current;
    if (lastSwitch?.filter === "load" && lastSwitch?.value === debouncedLoadNumber && lastSwitch?.targetOffice === activeTab) {
      setLoadSearchStatus("found");
      return;
    }
    
    // Prevent rapid re-triggering after tab switch (2000ms)
    const timeSinceLastSwitch = Date.now() - lastSwitchTimeRef.current;
    if (timeSinceLastSwitch < 2000) {
      return;
    }
    
    if (isSearchingRef.current) return;
    
    // Already searched this exact term via DB - don't hit DB again
    if (lastSearchedTermsRef.current.load === debouncedLoadNumber) {
      return;
    }
    
    // Local check - remember if found locally
    if (hasLocalMatch("load", debouncedLoadNumber)) {
      localMatchFoundRef.current = { filter: "load", value: debouncedLoadNumber, office: activeTab };
      setAmbiguousMatch(prev => prev?.filter === "load" ? null : prev);
      setLoadSearchStatus("found");
      // Match is in current tab — no spotlight needed
      setSpotlightDriverId?.(null);
      return;
    }

    // Circuit breaker
    if (dbErrorCountRef.current >= MAX_CONSECUTIVE_ERRORS && Date.now() < dbErrorBackoffUntilRef.current) {
      setLoadSearchStatus("not_found");
      lastSearchedTermsRef.current.load = debouncedLoadNumber;
      return;
    }

    const search = async () => {
      isSearchingRef.current = true;
      setLoadSearchStatus("searching");
      let resolved = false;
      try {
        // Race the DB lookup against an async cross-office local scan so the
        // network request starts immediately instead of waiting for the JS scan.
        const dbPromise = lookupLoadOffice(debouncedLoadNumber);
        const localPromise = Promise.resolve().then(() => {
          const match = findInAllLoadedData("load", debouncedLoadNumber);
          return normalizeToKnownOffice(match);
        });

        const localOffice = await localPromise;
        if (localOffice && localOffice !== activeTab) {
          lastAutoSwitchRef.current = { filter: "load", value: debouncedLoadNumber, targetOffice: localOffice };
          lastSwitchTimeRef.current = Date.now();
          setAmbiguousMatch(null);
          setLoadSearchStatus("found");
          setActiveTab(localOffice);
          resolved = true;
          // Don't await dbPromise — it'll complete in background, harmless.
          return;
        }

        const result = await dbPromise;
        if (resolved) return;

        if (result.type !== "error") {
          dbErrorCountRef.current = 0;
        } else {
          dbErrorCountRef.current++;
          if (dbErrorCountRef.current >= MAX_CONSECUTIVE_ERRORS) {
            dbErrorBackoffUntilRef.current = Date.now() + ERROR_BACKOFF_MS;
          }
        }

        if (result.type === "found") {
          const targetOffice = normalizeToKnownOffice(result.office);
          if (targetOffice && targetOffice !== activeTab) {
            lastAutoSwitchRef.current = { filter: "load", value: debouncedLoadNumber, targetOffice };
            lastSwitchTimeRef.current = Date.now();
            setAmbiguousMatch(null);
            setLoadSearchStatus("found");
            setFoundOrderMeta({ isLocked: result.isLocked, isCanceled: result.isCanceled, pickupDate: result.pickupDate });
            // Spotlight the matched driver so its row can render before
            // the rest of the new office finishes loading.
            if (result.driverId) setSpotlightDriverId?.(result.driverId);
            setActiveTab(targetOffice);
            return;
          }
        }

        if (result.type === "ambiguous") {
          const normalized = [...new Set(result.offices.map(normalizeToKnownOffice).filter(Boolean) as string[])];
          if (normalized.length === 1) {
            const targetOffice = normalized[0];
            if (targetOffice !== activeTab) {
              lastAutoSwitchRef.current = { filter: "load", value: debouncedLoadNumber, targetOffice };
              lastSwitchTimeRef.current = Date.now();
              setAmbiguousMatch(null);
              setLoadSearchStatus("found");
              setActiveTab(targetOffice);
              return;
            }
          } else if (normalized.length > 1) {
            setAmbiguousMatch({ filter: "load", offices: normalized });
            setLoadSearchStatus("found");
            return;
          }
        }

        if (result.type === "found") {
          setLoadSearchStatus("found");
          setFoundOrderMeta({ isLocked: result.isLocked, isCanceled: result.isCanceled, pickupDate: result.pickupDate });
          setAmbiguousMatch(prev => prev?.filter === "load" ? null : prev);
        } else {
          setAmbiguousMatch(prev => prev?.filter === "load" ? null : prev);
          setLoadSearchStatus("not_found");
          setFoundOrderMeta(null);
        }
      } finally {
        isSearchingRef.current = false;
        lastSearchedTermsRef.current.load = debouncedLoadNumber;
      }
    };
    
    search();
  // NOTE: Remove hasLocalMatch and findInAllLoadedData from deps - they use refs internally for stable checks
  }, [debouncedLoadNumber, activeTab, lookupLoadOffice, setActiveTab, normalizeToKnownOffice]);

  // Clear the last auto-switch ref when filters are cleared
  useEffect(() => {
    if (!truckDriverFilter && !dispatchNameFilter && !loadNumberFilter) {
      lastAutoSwitchRef.current = null;
      setAmbiguousMatch(null);
      setFoundOrderMeta(null);
      setSpotlightDriverId?.(null);
    }
  }, [truckDriverFilter, dispatchNameFilter, loadNumberFilter, setSpotlightDriverId]);

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
