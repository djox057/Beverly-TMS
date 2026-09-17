import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface DriverTruckPair {
  driverName: string;
  truckNumber: string;
}

/**
 * Active drivers with their assigned truck number, for the HR board's
 * searchable driver / truck dropdowns (driver ↔ truck autofill).
 */
export function useDriverTruckOptions() {
  const { data } = useQuery({
    queryKey: ["hr-driver-truck-options"],
    queryFn: async () => {
      const [driversRes, trucksRes] = await Promise.all([
        supabase.from("drivers").select("id, name, first_name, last_name, is_active"),
        supabase.from("trucks").select("truck_number, driver1_id"),
      ]);
      if (driversRes.error) throw driversRes.error;
      if (trucksRes.error) throw trucksRes.error;

      const truckByDriver = new Map<string, string>();
      for (const t of trucksRes.data || []) {
        if (t.driver1_id && t.truck_number) truckByDriver.set(t.driver1_id, String(t.truck_number));
      }

      const pairs: DriverTruckPair[] = [];
      for (const d of driversRes.data || []) {
        if (d.is_active === false) continue;
        const name =
          (d.name as string | null)?.trim() ||
          [d.first_name, d.last_name].filter(Boolean).join(" ").trim();
        if (!name) continue;
        pairs.push({ driverName: name, truckNumber: truckByDriver.get(d.id) || "" });
      }
      pairs.sort((a, b) => a.driverName.localeCompare(b.driverName));
      return pairs;
    },
    staleTime: 5 * 60 * 1000,
  });

  const pairs = data || [];

  return useMemo(() => {
    const truckByName = new Map<string, string>();
    const nameByTruck = new Map<string, string>();
    for (const p of pairs) {
      if (!truckByName.has(p.driverName)) truckByName.set(p.driverName, p.truckNumber);
      if (p.truckNumber && !nameByTruck.has(p.truckNumber)) nameByTruck.set(p.truckNumber, p.driverName);
    }
    const driverOptions = pairs.map((p) => ({
      value: p.driverName,
      label: p.truckNumber ? `${p.driverName} · ${p.truckNumber}` : p.driverName,
      searchText: `${p.driverName} ${p.truckNumber}`,
    }));
    const truckOptions = Array.from(nameByTruck.entries())
      .sort((a, b) => a[0].localeCompare(b[0], undefined, { numeric: true }))
      .map(([truck, name]) => ({
        value: truck,
        label: `${truck} · ${name}`,
        searchText: `${truck} ${name}`,
      }));
    return { pairs, driverOptions, truckOptions, truckByName, nameByTruck };
  }, [pairs]);
}
