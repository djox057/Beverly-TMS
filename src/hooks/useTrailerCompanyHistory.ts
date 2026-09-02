import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { differenceInDays } from "date-fns";
import type { Tenure } from "@/utils/tenureCalculator";

export interface TrailerCompanyHistoryRow {
  id: string;
  trailer_id: string;
  company_id: string | null;
  company_name_snapshot: string | null;
  started_at: string;
  ended_at: string | null;
  changed_by: string | null;
  changed_by_name_snapshot: string | null;
}

const toDatePart = (iso: string): string => iso.slice(0, 10);

export const useTrailerCompanyHistory = (trailerId: string | null) => {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!trailerId) return;
    const channel = supabase
      .channel(`trailer-company-history-${trailerId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "trailer_company_history",
          filter: `trailer_id=eq.${trailerId}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["trailer-company-history", trailerId] });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [trailerId, queryClient]);

  return useQuery({
    queryKey: ["trailer-company-history", trailerId],
    queryFn: async (): Promise<Tenure[]> => {
      if (!trailerId) return [];

      const { data, error } = await (supabase as any)
        .from("trailer_company_history")
        .select("*, companies(name)")
        .eq("trailer_id", trailerId)
        .order("started_at", { ascending: false });

      if (error) {
        console.error("Error fetching trailer company history:", error);
        throw error;
      }

      const rows = (data || []) as Array<TrailerCompanyHistoryRow & { companies?: { name: string } | null }>;

      return rows.map((r) => {
        const startDate = toDatePart(r.started_at);
        const endDate = r.ended_at ? toDatePart(r.ended_at) : null;
        const duration = differenceInDays(
          endDate ? new Date(endDate) : new Date(),
          new Date(startDate)
        );
        return {
          entityId: r.company_id,
          entityName: r.companies?.name || r.company_name_snapshot || null,
          startDate,
          endDate,
          durationDays: Math.max(0, duration),
          endReason: null,
          changedByName: r.changed_by_name_snapshot,
          isGap: !r.company_id,
          historyEntryIds: [r.id],
        } satisfies Tenure;
      });
    },
    enabled: !!trailerId,
    staleTime: 60_000,
  });
};
