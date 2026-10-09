import { useEffect, useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { busChannel } from "@/hooks/realtimeBus";

type InsuranceRow = {
  id: string;
  is_insured: boolean;
  insurance_company: { name: string } | null;
};

export function useTruckInsurance() {
  const queryClient = useQueryClient();
  useEffect(() => {
    const refresh = () => { void queryClient.invalidateQueries({ queryKey: ["truck-insurance"] }); };
    const channel = busChannel(refresh, "truck-insurance")
      .on("postgres_changes", { event: "*", schema: "public", table: "trucks" }, refresh)
      .subscribe();
    return () => { channel.unsubscribe(); };
  }, [queryClient]);

  const query = useQuery({
    queryKey: ["truck-insurance"],
    queryFn: async () => {
      const rows: InsuranceRow[] = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase.from("trucks")
          .select("id,is_insured,insurance_company:companies!trucks_insurance_company_id_fkey(name)")
          .order("id").range(from, from + 999);
        if (error) throw error;
        rows.push(...(data ?? []));
        if ((data ?? []).length < 1000) return rows;
      }
    },
    staleTime: 60_000,
    refetchOnWindowFocus: true,
  });

  const insuranceByTruckId = useMemo(() => query.data
    ? new Map(query.data.map(row => [row.id, {
        insured: row.is_insured,
        company: row.insurance_company?.name ?? null,
      }]))
    : undefined, [query.data]);

  return { ...query, insuranceByTruckId };
}
